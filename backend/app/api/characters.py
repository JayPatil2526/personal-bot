from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import llm
from app.agents.schemas import CharacterDraft
from app.api.schemas import CharacterDraftIn, CharacterIn
from app.core.security import get_current_user
from app.db.models import Character, CharacterBond, CharacterLifeEvent, User
from app.db.session import get_db

router = APIRouter(prefix="/characters", tags=["characters"])


def character_to_dict(c: Character, bond: CharacterBond | None = None) -> dict:
    return {
        "id": c.id, "name": c.name, "avatar": c.avatar, "color": c.color, "tagline": c.tagline, "age": c.age,
        "city": c.city, "occupation": c.occupation, "personality": c.personality, "speaking_style": c.speaking_style,
        "motivation_style": c.motivation_style, "backstory": c.backstory, "worldview": c.worldview,
        "family_friends": c.family_friends, "interests": c.interests, "is_preset": c.is_preset,
        "bond_level": bond.bond_level if bond else "new", "messages_count": bond.messages_count if bond else 0,
    }


def _accessible(db: Session, user: User, character_id: int) -> Character:
    c = db.get(Character, character_id)
    if not c or not (c.is_preset or c.owner_id == user.id):
        raise HTTPException(404, "Character not found")
    return c


@router.get("")
def list_characters(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chars = db.scalars(
        select(Character).where((Character.is_preset.is_(True)) | (Character.owner_id == user.id)).order_by(Character.id)
    ).all()
    bonds = {b.character_id: b for b in db.scalars(select(CharacterBond).where(CharacterBond.user_id == user.id)).all()}
    return [character_to_dict(c, bonds.get(c.id)) for c in chars]


@router.get("/{character_id}")
def get_character(character_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _accessible(db, user, character_id)
    bond = db.scalar(select(CharacterBond).where(CharacterBond.user_id == user.id, CharacterBond.character_id == c.id))
    events = db.scalars(
        select(CharacterLifeEvent)
        .where(CharacterLifeEvent.character_id == c.id,
               (CharacterLifeEvent.user_id.is_(None)) | (CharacterLifeEvent.user_id == user.id))
        .order_by(CharacterLifeEvent.created_at.desc()).limit(8)
    ).all()
    data = character_to_dict(c, bond)
    data["life_events"] = [{"title": e.title, "description": e.description, "emotion": e.emotion,
                            "shared": e.was_shared, "created_at": e.created_at.isoformat()} for e in events]
    return data


@router.post("")
def create_character(body: CharacterIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = Character(**body.model_dump(), owner_id=user.id, is_preset=False)
    db.add(c)
    db.commit()
    return character_to_dict(c)


@router.put("/{character_id}")
def update_character(character_id: int, body: CharacterIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    c = db.get(Character, character_id)
    if not c or c.owner_id != user.id:
        raise HTTPException(404, "Character not found or not editable")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return character_to_dict(c)


@router.delete("/{character_id}")
def delete_character(character_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(Character, character_id)
    if not c or c.owner_id != user.id:
        raise HTTPException(404, "Character not found or not deletable")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/draft")
def draft_character(body: CharacterDraftIn, user: User = Depends(get_current_user)):
    """AI auto-fill: turn a name + vibe into a full persona the user can edit before saving."""
    messages = [
        SystemMessage(
            "Create a realistic, likeable companion character for a lifestyle & goal-tracking app in India. "
            "Give them a distinct personality, speaking style and motivation style, a grounded backstory, "
            "a worldview, 3-4 people in their life and 4-6 interests. They are a real person, not an AI."
        ),
        HumanMessage(f"Name: {body.name}\nWhat the user wants: {body.vibe}"),
    ]
    draft = llm.structured("creative", CharacterDraft, messages)
    return {"name": body.name, **draft.model_dump()}
