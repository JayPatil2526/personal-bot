from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import CommitmentPatchIn
from app.core.security import get_current_user
from app.db.models import Commitment, User
from app.db.session import get_db
from app.services import goals as goal_svc
from app.services.insights import build_report

router = APIRouter(tags=["insights"])


def commitment_to_dict(c: Commitment, today) -> dict:
    return {
        "id": c.id, "text": c.text, "due_date": c.due_date.isoformat(), "status": c.status,
        "days_left": (c.due_date - today).days,
        "character": {"name": c.character.name, "avatar": c.character.avatar, "color": c.character.color} if c.character else None,
        "followed_up": c.followed_up_at is not None,
        "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
        "created_at": c.created_at.isoformat(),
    }


@router.get("/promises")
def list_promises(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = goal_svc.user_today(user)
    rows = db.scalars(select(Commitment).where(Commitment.user_id == user.id).order_by(Commitment.due_date.desc())).all()
    items = [commitment_to_dict(c, today) for c in rows]
    kept = sum(1 for c in rows if c.status == "kept")
    broken = sum(1 for c in rows if c.status == "broken")
    return {"items": items, "kept": kept, "broken": broken, "pending": len(rows) - kept - broken,
            "kept_rate": round(kept / (kept + broken), 2) if kept + broken else None}


@router.patch("/promises/{promise_id}")
def update_promise(promise_id: int, body: CommitmentPatchIn, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    from datetime import datetime, timezone

    c = db.get(Commitment, promise_id)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Promise not found")
    c.status = body.status
    c.resolved_at = None if body.status == "pending" else datetime.now(timezone.utc)
    db.commit()
    return commitment_to_dict(c, goal_svc.user_today(user))


@router.delete("/promises/{promise_id}")
def delete_promise(promise_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(Commitment, promise_id)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Promise not found")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.get("/insights/weekly")
def weekly(refresh: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = build_report(db, user, refresh=refresh)
    return {"period_start": r.period_start.isoformat(), "period_end": r.period_end.isoformat(),
            "generated_at": r.created_at.isoformat(), "stats": r.stats, "narrative": r.narrative}
