"""Developer panel: graph structure, per-turn traces and aggregate stats."""
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import llm
from app.agents.background import BACKGROUND_SPEC
from app.agents.graph import GRAPH_SPEC
from app.core.config import settings
from app.core.security import get_current_user
from app.db.models import AgentTrace, User
from app.db.session import get_db
from app.memory import embeddings, reranker

router = APIRouter(prefix="/dev", tags=["developer"])


@router.get("/graph")
def graph(user: User = Depends(get_current_user)):
    return {"foreground": GRAPH_SPEC["foreground"], "background": BACKGROUND_SPEC}


@router.get("/config")
def config(user: User = Depends(get_current_user)):
    return {
        "reply_model": settings.llm_reply_model,
        "fast_model": settings.llm_fast_model,
        "fallback_model": settings.llm_fallback_model,
        "embedding_model": embeddings.model_name().replace("models/", ""),
        "embedding_dim": settings.embedding_dim,
        "reranker": settings.reranker_model if reranker.enabled() else "disabled",
        "retrieval": {"candidates": settings.retrieval_candidates, "top_k": settings.retrieval_top_k,
                      "max_distance": settings.max_distance, "weights": {"relevance": 0.6, "importance": 0.25, "recency": 0.15}},
        "mistral_configured": bool(settings.mistral_api_key),
        "gemini_configured": bool(settings.gemini_api_key),
        "provider_circuits": llm.provider_status(),
    }


def trace_to_dict(t: AgentTrace) -> dict:
    return {"id": t.id, "kind": t.kind, "session_id": t.session_id, "message_id": t.message_id,
            "user_message": t.user_message, "nodes": t.nodes, "route": t.route, "retrieved": t.retrieved,
            "total_ms": t.total_ms, "input_tokens": t.input_tokens, "output_tokens": t.output_tokens,
            "providers": t.providers, "created_at": t.created_at.isoformat()}


@router.get("/traces")
def traces(session_id: int | None = None, kind: str | None = None, limit: int = 30,
           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(AgentTrace).where(AgentTrace.user_id == user.id)
    if session_id:
        q = q.where(AgentTrace.session_id == session_id)
    if kind:
        q = q.where(AgentTrace.kind == kind)
    return [trace_to_dict(t) for t in db.scalars(q.order_by(AgentTrace.id.desc()).limit(limit)).all()]


@router.get("/traces/{trace_id}")
def trace(trace_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(AgentTrace, trace_id)
    if not t or t.user_id != user.id:
        return {}
    return trace_to_dict(t)


@router.get("/stats")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(AgentTrace).where(AgentTrace.user_id == user.id).order_by(AgentTrace.id.desc()).limit(300)).all()
    per_node: dict[str, list[float]] = defaultdict(list)
    tokens_node: dict[str, int] = defaultdict(int)
    fallbacks = 0
    for t in rows:
        for n in t.nodes or []:
            per_node[n["node"]].append(n["ms"])
            tokens_node[n["node"]] += n.get("input_tokens", 0) + n.get("output_tokens", 0)
            fallbacks += 1 if n.get("fallback") else 0
    chat = [t for t in rows if t.kind == "chat"]
    return {
        "turns": len(chat),
        "avg_turn_ms": round(sum(t.total_ms for t in chat) / len(chat), 1) if chat else 0,
        "avg_tokens_per_turn": round(sum(t.input_tokens + t.output_tokens for t in chat) / len(chat)) if chat else 0,
        "fallback_calls": fallbacks,
        "nodes": sorted(
            [{"node": k, "calls": len(v), "avg_ms": round(sum(v) / len(v), 1), "tokens": tokens_node[k]} for k, v in per_node.items()],
            key=lambda x: -x["avg_ms"],
        ),
    }
