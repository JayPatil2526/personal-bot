"""Re-embed every episode and fact with the currently configured EMBEDDING_PROVIDER.

Run after changing EMBEDDING_PROVIDER:  python -m app.memory.reembed
"""
from sqlalchemy import select

from app.db.models import Episode, Fact
from app.db.session import SessionLocal
from app.memory.embeddings import embed_text, model_name


def main() -> None:
    with SessionLocal() as db:
        episodes = db.scalars(select(Episode)).all()
        facts = db.scalars(select(Fact)).all()
        for e in episodes:
            e.embedding = embed_text(e.summary)
        for f in facts:
            f.embedding = embed_text(f.fact)
        db.commit()
        print(f"Re-embedded {len(episodes)} episodes and {len(facts)} facts with {model_name()}")


if __name__ == "__main__":
    main()
