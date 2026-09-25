"""Hybrid memory retrieval.

1. pgvector cosine search over episodes + facts (HNSW index) → candidates
2. keyword-trigger boost (exact / token overlap with stored keywords)
3. local cross-encoder rerank
4. final score = 0.60 · relevance + 0.25 · importance + 0.15 · recency
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.db.models import Episode, Fact
from app.memory import reranker
from app.memory.embeddings import embed_text

W_REL, W_IMP, W_REC = 0.60, 0.25, 0.15
RECENCY_HALF_LIFE_DAYS = 14


@dataclass
class RetrievalResult:
    items: list[dict] = field(default_factory=list)
    used_vector: bool = False
    used_reranker: bool = False
    candidates: int = 0


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(t) > 2}


def _keyword_bonus(query_tokens: set[str], keywords: list[str], text: str) -> float:
    kw_tokens = set()
    for k in keywords or []:
        kw_tokens |= _tokens(str(k))
    overlap = query_tokens & (kw_tokens | _tokens(text))
    return min(0.15, 0.05 * len(overlap))


def _recency(ts: datetime) -> float:
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    days = max(0.0, (datetime.now(timezone.utc) - ts).total_seconds() / 86400)
    return math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS)


def retrieve(
    db: Session,
    user_id: int,
    query: str,
    query_vec: list[float] | None = None,
    top_k: int | None = None,
    use_reranker: bool = True,
) -> RetrievalResult:
    top_k = top_k or settings.retrieval_top_k
    n = settings.retrieval_candidates
    result = RetrievalResult()
    vec = query_vec if query_vec is not None else embed_text(query)
    q_tokens = _tokens(query)

    candidates: list[dict] = []
    if vec is not None:
        result.used_vector = True
        ep_dist = Episode.embedding.cosine_distance(vec).label("distance")
        rows = db.execute(
            select(Episode, ep_dist)
            .options(joinedload(Episode.character))
            .where(Episode.user_id == user_id, Episode.embedding.is_not(None))
            .order_by(ep_dist)
            .limit(n)
        ).all()
        candidates += [_episode_item(e, d) for e, d in rows if d <= settings.max_distance]

        fact_dist = Fact.embedding.cosine_distance(vec).label("distance")
        rows = db.execute(
            select(Fact, fact_dist)
            .where(Fact.user_id == user_id, Fact.embedding.is_not(None))
            .order_by(fact_dist)
            .limit(n)
        ).all()
        candidates += [_fact_item(f, d) for f, d in rows if d <= settings.max_distance]
    else:
        # Degraded mode: recent memories, ranked by keyword overlap
        episodes = db.scalars(
            select(Episode).options(joinedload(Episode.character)).where(Episode.user_id == user_id)
            .order_by(Episode.occurred_at.desc()).limit(n)
        ).all()
        facts = db.scalars(select(Fact).where(Fact.user_id == user_id).order_by(Fact.updated_at.desc()).limit(n)).all()
        candidates = [_episode_item(e, None) for e in episodes] + [_fact_item(f, None) for f in facts]

    result.candidates = len(candidates)
    if not candidates:
        return result

    rerank_scores = reranker.score(query, [c["text"] for c in candidates]) if use_reranker else None
    result.used_reranker = rerank_scores is not None

    for i, c in enumerate(candidates):
        bonus = _keyword_bonus(q_tokens, c.pop("_keywords"), c["text"])
        if rerank_scores is not None:
            relevance = rerank_scores[i]
        elif c["distance"] is not None:
            relevance = max(0.0, 1 - c["distance"])
        else:
            relevance = 0.0
        relevance = min(1.0, relevance + bonus)
        c["rerank"] = round(rerank_scores[i], 4) if rerank_scores is not None else None
        c["keyword_bonus"] = round(bonus, 3)
        c["relevance"] = round(relevance, 4)
        c["score"] = round(W_REL * relevance + W_IMP * c["importance"] / 10 + W_REC * c["recency"], 4)

    candidates.sort(key=lambda c: c["score"], reverse=True)
    result.items = candidates[:top_k]
    return result


def _episode_item(e: Episode, distance: float | None) -> dict:
    return {
        "type": "episode",
        "id": e.id,
        "text": e.summary,
        "emotion": e.emotion,
        "importance": e.importance,
        "character": e.character.name if e.character else None,
        "when": e.occurred_at.isoformat(),
        "distance": round(float(distance), 4) if distance is not None else None,
        "recency": round(_recency(e.occurred_at), 4),
        "_keywords": e.keywords or [],
    }


def _fact_item(f: Fact, distance: float | None) -> dict:
    return {
        "type": "fact" if f.kind == "fact" else "preference",
        "id": f.id,
        "text": f.fact,
        "category": f.category,
        "importance": round(f.confidence * 10),
        "when": f.updated_at.isoformat(),
        "distance": round(float(distance), 4) if distance is not None else None,
        "recency": round(_recency(f.updated_at), 4),
        "_keywords": f.keywords or [],
    }
