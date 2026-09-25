import json
import queue
import threading

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.agents.runner import message_to_dict, run_turn
from app.api.characters import _accessible, character_to_dict
from app.api.schemas import ChatIn, SessionIn
from app.core.security import get_current_user
from app.db.models import ChatSession, Message, User
from app.db.session import get_db

router = APIRouter(prefix="/sessions", tags=["chat"])


def _own_session(db: Session, user: User, session_id: int) -> ChatSession:
    s = db.get(ChatSession, session_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404, "Session not found")
    return s


@router.get("")
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sessions = db.scalars(
        select(ChatSession).options(joinedload(ChatSession.character))
        .where(ChatSession.user_id == user.id).order_by(ChatSession.updated_at.desc())
    ).all()
    last_msgs = {}
    if sessions:
        sub = (
            select(Message.session_id, func.max(Message.id).label("mid"))
            .where(Message.session_id.in_([s.id for s in sessions])).group_by(Message.session_id).subquery()
        )
        for m in db.scalars(select(Message).join(sub, Message.id == sub.c.mid)).all():
            last_msgs[m.session_id] = m
    return [
        {
            "id": s.id, "title": s.title, "updated_at": s.updated_at.isoformat(),
            "character": {"id": s.character.id, "name": s.character.name, "avatar": s.character.avatar,
                          "color": s.character.color},
            "last_message": (last_msgs[s.id].content[:90] if s.id in last_msgs else ""),
        }
        for s in sessions
    ]


@router.post("")
def create_session(body: SessionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    character = _accessible(db, user, body.character_id)
    s = ChatSession(user_id=user.id, character_id=character.id)
    db.add(s)
    db.commit()
    return {"id": s.id, "title": s.title, "character": character_to_dict(character), "messages": []}


@router.get("/{session_id}")
def get_session(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _own_session(db, user, session_id)
    return {"id": s.id, "title": s.title, "character": character_to_dict(s.character),
            "messages": [message_to_dict(m) for m in s.messages]}


@router.patch("/{session_id}")
def rename_session(session_id: int, body: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _own_session(db, user, session_id)
    title = str(body.get("title", "")).strip()
    if title:
        s.title = title[:200]
        db.commit()
    return {"id": s.id, "title": s.title}


@router.delete("/{session_id}")
def delete_session(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = _own_session(db, user, session_id)
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.post("/{session_id}/chat")
def chat(session_id: int, body: ChatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Server-Sent Events stream: user_message → step* → token* → reply_done → step* (background) → memory → done."""
    _own_session(db, user, session_id)
    events: queue.Queue = queue.Queue()

    def emit(event: str, data: dict) -> None:
        events.put((event, data))

    threading.Thread(target=run_turn, args=(user.id, session_id, body.message.strip(), emit), daemon=True).start()

    def stream():
        while True:
            try:
                event, data = events.get(timeout=20)
            except queue.Empty:
                yield ": keep-alive\n\n"
                continue
            yield f"event: {event}\ndata: {json.dumps(data, default=str, ensure_ascii=False)}\n\n"
            if event in ("done", "error"):
                break

    return StreamingResponse(
        stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
