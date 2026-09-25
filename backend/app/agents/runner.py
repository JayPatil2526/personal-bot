"""Executes one chat turn: foreground graph (streams reply) → background memory graph."""
from __future__ import annotations

import logging

from app.agents.background import background_graph
from app.agents.context import Emit, TurnContext
from app.agents.graph import chat_graph, save_trace
from app.agents.llm import Usage
from app.db.models import AgentTrace, Message
from app.db.session import SessionLocal

logger = logging.getLogger("lifecoach.runner")


def message_to_dict(m: Message) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "meta": m.meta or {}, "created_at": m.created_at.isoformat()}


def run_turn(user_id: int, session_id: int, user_message: str, emit: Emit) -> None:
    db = SessionLocal()
    try:
        user_msg = Message(session_id=session_id, role="user", content=user_message, meta={})
        db.add(user_msg)
        db.commit()
        emit("user_message", message_to_dict(user_msg))

        usage = Usage()
        ctx = TurnContext(db=db, emit=emit, usage=usage)
        state = chat_graph.invoke(
            {"user_id": user_id, "session_id": session_id, "user_message": user_message, "user_message_id": user_msg.id},
            config={"configurable": {"ctx": ctx}, "recursion_limit": 40},
        )
        trace = save_trace(db, state, usage)

        replies = [db.get(Message, mid) for mid in state.get("assistant_message_ids", [])]
        assistant = replies[0] if replies else None
        steps = [{k: n[k] for k in ("node", "label", "ms", "note", "status")} for n in state.get("trace", [])]
        for m in replies:
            m.meta = {**(m.meta or {}), "trace_id": trace.id, "steps": steps}
        db.commit()
        if replies:
            emit("reply_done", {"message": message_to_dict(assistant), "messages": [message_to_dict(m) for m in replies],
                                "trace_id": trace.id, "total_ms": trace.total_ms,
                                "tokens": trace.input_tokens + trace.output_tokens})

        # ── Background memory graph (same worker thread, events keep streaming) ──
        bg_usage = Usage()
        bg_ctx = TurnContext(db=db, emit=emit, usage=bg_usage)
        bg_state = background_graph.invoke(
            {
                "user_id": user_id,
                "session_id": session_id,
                "character_id": state["character"].id,
                "user_message": user_message,
                "assistant_message": state.get("response", ""),
                "intent": state.get("intent", "chit_chat"),
                "contains_new_info": state.get("contains_new_info", False),
            },
            config={"configurable": {"ctx": bg_ctx}, "recursion_limit": 40},
        )
        bg_chips = bg_state.get("chips", [])
        bg_nodes = bg_state.get("trace", [])
        db.add(AgentTrace(
            user_id=user_id, session_id=session_id, message_id=state.get("assistant_message_id"), kind="background",
            user_message=user_message, nodes=bg_nodes, route=bg_state.get("route", []),
            total_ms=round(sum(n["ms"] for n in bg_nodes), 1), input_tokens=bg_usage.input_tokens,
            output_tokens=bg_usage.output_tokens, providers=bg_usage.providers,
        ))
        if assistant is not None and bg_chips:
            assistant.meta = {**assistant.meta, "memory_chips": bg_chips}
        db.commit()
        emit("memory", {"chips": bg_chips, "message_id": state.get("assistant_message_id")})
        emit("done", {})
    except Exception as exc:  # noqa: BLE001
        logger.exception("Turn failed")
        db.rollback()
        emit("error", {"message": str(exc)})
    finally:
        db.close()
