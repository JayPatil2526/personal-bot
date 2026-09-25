"""Per-turn runtime context shared by graph nodes (DB session, event emitter, usage tracker) + step tracing."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from functools import wraps
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.agents.llm import Usage

logger = logging.getLogger("lifecoach.graph")

Emit = Callable[[str, dict], None]


@dataclass
class TurnContext:
    db: Session
    emit: Emit
    usage: Usage = field(default_factory=Usage)
    extras: dict[str, Any] = field(default_factory=dict)


def traced(name: str, label: str, phase: str = "foreground"):
    """Wrap a node: emit live step events, time it, attribute LLM tokens, and append a trace entry."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(state: dict, config: dict) -> dict:
            ctx: TurnContext = config["configurable"]["ctx"]
            ctx.emit("step", {"node": name, "label": label, "phase": phase, "status": "running"})
            start = time.perf_counter()
            first_call = len(ctx.usage)
            status = "done"
            try:
                out = fn(state, ctx) or {}
            except Exception as exc:  # noqa: BLE001  — a failing node must not kill the turn
                logger.exception("Node %s failed", name)
                out = {"_note": f"error: {exc}"}
                status = "error"
                try:
                    ctx.db.rollback()
                except Exception:  # noqa: BLE001
                    pass
            ms = round((time.perf_counter() - start) * 1000, 1)
            calls = ctx.usage.since(first_call)
            entry = {
                "node": name,
                "label": label,
                "phase": phase,
                "status": status,
                "ms": ms,
                "input_tokens": sum(c.input_tokens for c in calls),
                "output_tokens": sum(c.output_tokens for c in calls),
                "providers": sorted({f"{c.provider}:{c.model}" for c in calls}),
                "fallback": any(c.fallback for c in calls),
                "note": out.pop("_note", ""),
                "detail": out.pop("_detail", None),
            }
            ctx.emit("step", {**entry, "status": status})
            out["trace"] = [entry]
            out["route"] = [name]
            return out

        # LangGraph inspects the signature/type hints to decide whether to pass `config`;
        # expose the wrapper's own (state, config) signature instead of the inner (state, ctx) one.
        del wrapper.__wrapped__
        wrapper.__annotations__ = {}
        return wrapper

    return decorator
