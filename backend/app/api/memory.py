from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import get_current_user
from app.db.models import CharacterNote, Episode, Fact, User
from app.db.session import get_db
from app.memory.retrieval import retrieve

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("/episodes")
def episodes(limit: int = 100, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Episode).options(joinedload(Episode.character)).where(Episode.user_id == user.id)
        .order_by(Episode.occurred_at.desc()).limit(limit)
    ).all()
    return [{"id": e.id, "summary": e.summary, "emotion": e.emotion, "importance": e.importance, "kind": e.kind,
             "keywords": e.keywords, "when": e.occurred_at.isoformat(),
             "character": {"name": e.character.name, "avatar": e.character.avatar, "color": e.character.color}
             if e.character else None} for e in rows]


@router.get("/facts")
def facts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Fact).where(Fact.user_id == user.id).order_by(Fact.updated_at.desc())).all()
    return [{"id": f.id, "fact": f.fact, "category": f.category, "kind": f.kind, "confidence": f.confidence,
             "keywords": f.keywords, "times_updated": f.times_updated, "updated_at": f.updated_at.isoformat()} for f in rows]


@router.get("/notes")
def notes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(CharacterNote).where(CharacterNote.user_id == user.id)
                      .order_by(CharacterNote.created_at.desc()).limit(50)).all()
    return [{"id": n.id, "note": n.note, "when": n.created_at.isoformat(),
             "character": {"name": n.character.name, "avatar": n.character.avatar, "color": n.character.color}} for n in rows]


@router.get("/search")
def search(q: str, rerank: bool = True, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    res = retrieve(db, user.id, q, use_reranker=rerank, top_k=10)
    return {"query": q, "used_vector": res.used_vector, "used_reranker": res.used_reranker,
            "candidates": res.candidates, "results": res.items}


@router.delete("/facts/{fact_id}")
def delete_fact(fact_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.get(Fact, fact_id)
    if not f or f.user_id != user.id:
        raise HTTPException(404, "Fact not found")
    db.delete(f)
    db.commit()
    return {"ok": True}


@router.delete("/episodes/{episode_id}")
def delete_episode(episode_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    e = db.get(Episode, episode_id)
    if not e or e.user_id != user.id:
        raise HTTPException(404, "Episode not found")
    db.delete(e)
    db.commit()
    return {"ok": True}
