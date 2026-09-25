"""Create the pgvector extension, all tables, and seed preset characters (idempotent)."""
from sqlalchemy import select, text

from app.db import models  # noqa: F401  (registers tables)
from app.db.models import Character, CharacterLifeEvent
from app.db.session import Base, SessionLocal, engine
from app.seed.characters import PRESET_CHARACTERS, PRESET_LIFE_EVENTS


def init_db() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)
    seed_characters()


def seed_characters() -> None:
    with SessionLocal() as db:
        for data in PRESET_CHARACTERS:
            existing = db.scalar(select(Character).where(Character.is_preset.is_(True), Character.name == data["name"]))
            if existing:
                for key, value in data.items():
                    setattr(existing, key, value)
                continue
            character = Character(**data, is_preset=True)
            db.add(character)
            db.flush()
            for title, description, emotion in PRESET_LIFE_EVENTS.get(data["name"], []):
                db.add(
                    CharacterLifeEvent(
                        character_id=character.id, title=title, description=description, emotion=emotion
                    )
                )
        db.commit()


if __name__ == "__main__":
    init_db()
    print("Database initialised.")
