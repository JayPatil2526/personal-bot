"""Experiment 4 — read-only latency / token statistics from the agent_traces table (real usage of the app).

Run: python -m eval.trace_stats
"""
from __future__ import annotations

import statistics
from collections import Counter, defaultdict

from sqlalchemy import func, select

from app.db.models import AgentTrace
from app.db.session import SessionLocal
from eval.common import latency_stats, save


def _node_stats(traces: list[AgentTrace]) -> dict:
    per_node: dict[str, list[float]] = defaultdict(list)
    for t in traces:
        for n in t.nodes or []:
            per_node[n["node"]].append(float(n.get("ms", 0)))
    return {
        node: {"runs": len(v), "mean_ms": round(statistics.mean(v), 1), "median_ms": round(statistics.median(v), 1)}
        for node, v in sorted(per_node.items(), key=lambda kv: -statistics.mean(kv[1]))
    }


def run() -> dict:
    db = SessionLocal()
    try:
        by_kind = dict(db.execute(select(AgentTrace.kind, func.count()).group_by(AgentTrace.kind)).all())
        chats = list(db.scalars(select(AgentTrace).where(AgentTrace.kind == "chat").order_by(AgentTrace.id)).all())
        background = list(db.scalars(select(AgentTrace).where(AgentTrace.kind == "background")).all())
        if not chats:
            return {"traces_by_kind": by_kind, "chat_turns": 0, "note": "no chat traces recorded"}

        llm_nodes = [n for t in chats for n in (t.nodes or []) if n.get("providers")]
        turns_with_fallback = sum(1 for t in chats if any(n.get("fallback") for n in (t.nodes or [])))
        providers = Counter(p for n in llm_nodes for p in n["providers"])
        routes = Counter(" → ".join(t.route or []) for t in chats)
        intents = Counter()
        for t in chats:
            for n in t.nodes or []:
                if n["node"] == "classify" and isinstance(n.get("detail"), dict):
                    intents[n["detail"].get("intent")] += 1
        users = len({t.user_id for t in chats})
        return {
            "traces_by_kind": by_kind,
            "chat_turns": len(chats),
            "distinct_users": users,
            "period": [chats[0].created_at.isoformat(timespec="minutes"), chats[-1].created_at.isoformat(timespec="minutes")],
            "chat_total_ms": latency_stats([t.total_ms for t in chats]),
            "chat_ms_excluding_responder": latency_stats([
                sum(n["ms"] for n in (t.nodes or []) if n["node"] != "responder") for t in chats
            ]),
            "avg_input_tokens_per_turn": round(statistics.mean(t.input_tokens for t in chats), 1),
            "avg_output_tokens_per_turn": round(statistics.mean(t.output_tokens for t in chats), 1),
            "avg_llm_calls_per_turn": round(len(llm_nodes) / len(chats), 2),
            "avg_nodes_per_turn": round(statistics.mean(len(t.nodes or []) for t in chats), 2),
            "node_ms": _node_stats(chats),
            "fallback_turn_share": round(turns_with_fallback / len(chats), 3),
            "fallback_llm_node_share": round(sum(1 for n in llm_nodes if n.get("fallback")) / len(llm_nodes), 3) if llm_nodes else None,
            "llm_node_providers": dict(providers.most_common()),
            "classified_intents": dict(intents.most_common()),
            "top_routes": dict(routes.most_common(8)),
            "background_total_ms": latency_stats([t.total_ms for t in background]),
            "background_node_ms": _node_stats(background),
        }
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    result = run()
    path = save("trace_stats", result)
    print(result)
    print(f"saved {path}")
