"""Experiment 3 — episodic/semantic memory retrieval quality.

Creates a temporary user, stores 30 memories (18 facts + 12 episodes) embedded with the app's own embedding
functions, then asks 30 paraphrased queries whose answer is exactly one stored memory. For every query the real
retrieve() is run with and without the cross-encoder reranker; a pure cosine ranking of the same candidates is
reported as a baseline. The user and all its rows are always deleted at the end.
Run: python -m eval.memory_eval
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.core.config import settings
from app.db.models import Episode, Fact, User
from app.db.session import SessionLocal
from app.memory import reranker
from app.memory.embeddings import embed_many, embed_query, embed_text, model_name, provider
from app.memory.retrieval import retrieve
from eval.common import latency_stats, save

EMBED_SLEEP = 0.4
K_VALUES = (1, 3, 6)

# key → (fact text, category, kind, confidence, keywords, days since last update)
FACTS = {
    "F1": ("User is vegetarian and does not eat eggs.", "food", "fact", 0.9, ["vegetarian", "eggs"], 30),
    "F2": ("User is lactose intolerant; milk gives him stomach aches.", "health", "fact", 0.9, ["lactose", "milk"], 28),
    "F3": ("User studies B.Tech Computer Engineering, third year, at a college in Ahmedabad.", "education", "fact", 0.95, ["btech", "college"], 35),
    "F4": ("User's younger sister Priya is in class 10 and preparing for her board exams.", "family", "fact", 0.8, ["sister", "priya"], 15),
    "F5": ("User prefers working out early in the morning, around 6 am, before college.", "schedule", "preference", 0.8, ["workout", "morning"], 12),
    "F6": ("User's favourite cricketer is Virat Kohli and he supports RCB in the IPL.", "hobby", "preference", 0.85, ["cricket", "rcb"], 40),
    "F7": ("User plays acoustic guitar and is learning Arijit Singh songs.", "hobby", "fact", 0.8, ["guitar", "arijit"], 20),
    "F8": ("User has mild asthma and carries an inhaler.", "health", "fact", 0.9, ["asthma", "inhaler"], 45),
    "F9": ("User wants to become a data scientist after graduation.", "work", "fact", 0.85, ["data scientist", "career"], 25),
    "F10": ("User gets 4000 rupees per month as pocket money from his parents.", "finance", "fact", 0.8, ["pocket money"], 22),
    "F11": ("User dislikes spicy food and always asks for less chilli.", "food", "preference", 0.8, ["spicy", "chilli"], 18),
    "F12": ("User's father runs a small textile shop in Surat.", "family", "fact", 0.85, ["father", "textile"], 50),
    "F13": ("User is allergic to peanuts.", "health", "fact", 0.95, ["allergy", "peanuts"], 60),
    "F14": ("User prefers texting in Hinglish and likes short replies.", "personality", "preference", 0.75, ["hinglish"], 10),
    "F15": ("User's best friend Karan moved to Bangalore for a job.", "family", "fact", 0.8, ["karan", "bangalore"], 33),
    "F16": ("User usually sleeps around 1:30 am because he plays online games late.", "schedule", "fact", 0.75, ["sleep", "gaming"], 8),
    "F17": ("User's birthday is on 14 March.", "other", "fact", 0.95, ["birthday"], 70),
    "F18": ("User's laptop is an old Lenovo ThinkPad that often overheats.", "other", "fact", 0.7, ["laptop"], 14),
}

# key → (summary, emotion, importance, keywords, days ago)
EPISODES = {
    "E1": ("User failed his Operating Systems mid-sem exam and felt ashamed telling his parents.", "ashamed", 8, ["exam", "failed"], 25),
    "E2": ("User went on a trek to Saputara with college friends and loved the monsoon views.", "happy", 6, ["trek", "saputara"], 20),
    "E3": ("User had a big fight with his roommate over cleaning the room and they didn't talk for two days.", "angry", 6, ["roommate", "fight"], 12),
    "E4": ("User got shortlisted for a summer internship interview at a fintech startup in Pune.", "excited", 8, ["internship", "pune"], 8),
    "E5": ("User's grandmother was hospitalised with a heart problem; he was anxious and travelled home to Surat.", "anxious", 9, ["grandmother", "hospital"], 30),
    "E6": ("User started a 30-day no-sugar challenge and completed the first week.", "proud", 6, ["sugar", "challenge"], 5),
    "E7": ("User stayed up all night to finish his DBMS project and submitted it just before the deadline.", "tired", 5, ["dbms", "project"], 3),
    "E8": ("User went to the gym for the first time in two months and his legs were sore the next day.", "sore", 5, ["gym"], 2),
    "E9": ("User bought new running shoes for 2500 rupees in a Flipkart sale.", "happy", 4, ["shoes", "flipkart"], 10),
    "E10": ("User felt lonely during the Navratri break because most of his hostel friends went home.", "lonely", 7, ["lonely", "hostel"], 18),
    "E11": ("User watched the India vs Australia match with friends at a cafe and India won.", "happy", 5, ["cricket", "match"], 6),
    "E12": ("User presented his machine learning mini-project on crop price prediction and the professor praised it.", "proud", 7, ["ml", "project"], 1),
}

# (query, key of the one memory that answers it) — paraphrased, several in Hinglish
QUERIES = [
    ("Can I suggest an omelette for his breakfast?", "F1"),
    ("Raat ko haldi doodh peene se usko problem hogi kya?", "F2"),
    ("Which year of engineering is he in and in what branch?", "F3"),
    ("Kya uski behen kisi exam ki taiyari kar rahi hai?", "F4"),
    ("At what time of day does he like to exercise?", "F5"),
    ("Which IPL team does he cheer for?", "F6"),
    ("What musical instrument does he play?", "F7"),
    ("Does he have a breathing condition I should keep in mind before suggesting running?", "F8"),
    ("What does he want to do as a career once he finishes college?", "F9"),
    ("How much money do his parents send him each month?", "F10"),
    ("Should I recommend a very teekha mirchi wala dish to him?", "F11"),
    ("What business does his papa do?", "F12"),
    ("Is it safe to offer him a groundnut snack?", "F13"),
    ("In what language and style does he like to chat?", "F14"),
    ("Who is his closest friend and where does that person live now?", "F15"),
    ("Why is he always awake so late at night?", "F16"),
    ("Which date should I plan a surprise for his janamdin?", "F17"),
    ("Is his computer giving him trouble?", "F18"),
    ("Did he do badly in any midterm test?", "E1"),
    ("Did he go on a trip to the hills recently?", "E2"),
    ("Did he have an argument with the person he shares his room with?", "E3"),
    ("Kya usko kisi company se internship ka call aaya?", "E4"),
    ("Is anyone in his family unwell?", "E5"),
    ("Has he tried giving up sweets?", "E6"),
    ("Why was he so exhausted a few days ago?", "E7"),
    ("Gym wapas jaana shuru kiya kya usne?", "E8"),
    ("Did he buy anything new for running?", "E9"),
    ("Tyohaar ki chhuttiyon mein woh akela feel kar raha tha kya?", "E10"),
    ("Did he watch any cricket match recently?", "E11"),
    ("What did the professor think of his project demo?", "E12"),
]


def _rank(items: list[dict], target: tuple[str, int]) -> int | None:
    for i, it in enumerate(items, 1):
        if (_kind(it), it["id"]) == target:
            return i
    return None


def _kind(item: dict) -> str:
    return "episode" if item["type"] == "episode" else "fact"


def _metrics(ranks: list[int | None]) -> dict:
    n = len(ranks)
    out = {f"recall@{k}": round(sum(1 for r in ranks if r and r <= k) / n, 3) for k in K_VALUES}
    out["mrr"] = round(sum(1 / r for r in ranks if r) / n, 3)
    out["not_in_candidates"] = sum(1 for r in ranks if r is None)
    return out


def _seed(db, user: User) -> dict[str, tuple[str, int]]:
    now = datetime.now(timezone.utc)
    ids: dict[str, tuple[str, int]] = {}
    fact_keys = list(FACTS)
    vectors = []
    for key in fact_keys:  # embed_many embeds one text per call for gemini; spaced out for rate limits
        vectors += embed_many([FACTS[key][0]])
        time.sleep(EMBED_SLEEP)
    for key, vec in zip(fact_keys, vectors):
        text, category, kind, conf, keywords, days = FACTS[key]
        f = Fact(user_id=user.id, fact=text, category=category, kind=kind, confidence=conf, keywords=keywords,
                 embedding=vec, created_at=now - timedelta(days=days), updated_at=now - timedelta(days=days))
        db.add(f)
        db.flush()
        ids[key] = ("fact", f.id)
    for key, (summary, emotion, importance, keywords, days) in EPISODES.items():
        vec = embed_text(summary)
        time.sleep(EMBED_SLEEP)
        e = Episode(user_id=user.id, summary=summary, emotion=emotion, importance=importance, keywords=keywords,
                    embedding=vec, occurred_at=now - timedelta(days=days))
        db.add(e)
        db.flush()
        ids[key] = ("episode", e.id)
    db.commit()
    missing = [k for k, v in zip(fact_keys, vectors) if v is None] + [
        k for k in EPISODES if db.get(Episode, ids[k][1]).embedding is None
    ]
    if missing:
        raise RuntimeError(f"embedding failed for memories {missing}; aborting (no vectors to evaluate)")
    return ids


def run() -> dict:
    db = SessionLocal()
    user = User(email=f"eval+{int(time.time())}@lifecrew.local", password_hash="!", name="Eval User", is_developer=False)
    db.add(user)
    db.commit()
    user_id = user.id
    try:
        ids = _seed(db, user)
        reranker.get_model() if reranker.enabled() else None
        rows = []
        timeouts = 0
        for i, (query, key) in enumerate(QUERIES, 1):
            start = time.perf_counter()
            vec = embed_query(query)  # app path, with the live-chat timeout
            embed_ms = (time.perf_counter() - start) * 1000
            timed_out = vec is None
            if timed_out:
                timeouts += 1
                vec = embed_text(query)  # evaluate with a real vector anyway; the timeout is reported
            time.sleep(EMBED_SLEEP)
            target = ids[key]
            row = {"query": query, "expected": key, "embed_ms": round(embed_ms, 1), "embed_timeout": timed_out,
                   "has_vector": vec is not None}
            for mode, use_rr in (("rerank", True), ("no_rerank", False)):
                t0 = time.perf_counter()
                res = retrieve(db, user_id, query, query_vec=vec, top_k=100, use_reranker=use_rr)
                row[f"{mode}_ms"] = round((time.perf_counter() - t0) * 1000, 1)
                row[f"{mode}_rank"] = _rank(res.items, target)
                row[f"{mode}_top1"] = res.items[0]["text"] if res.items else ""
                row["used_vector"] = res.used_vector
                row["candidates"] = res.candidates
                if use_rr:
                    row["used_reranker"] = res.used_reranker
                    by_cosine = sorted(res.items, key=lambda c: c["distance"] if c["distance"] is not None else 9)
                    row["cosine_rank"] = _rank(by_cosine, target)
            rows.append(row)
            print(f"[memory {i}/{len(QUERIES)}] {key:<4} rerank={row['rerank_rank']} no_rerank={row['no_rerank_rank']} "
                  f"cosine={row['cosine_rank']}  {query}")

        return {
            "n_memories": len(ids),
            "n_facts": len(FACTS),
            "n_episodes": len(EPISODES),
            "n_queries": len(QUERIES),
            "embedding": f"{provider()}:{model_name()} ({settings.embedding_dim} dims)",
            "reranker": settings.reranker_model if reranker.enabled() else "disabled",
            "production_top_k": settings.retrieval_top_k,
            "all_used_vector": all(r["used_vector"] for r in rows),
            "all_used_reranker": all(r["used_reranker"] for r in rows),
            "query_embed_timeouts": timeouts,
            "query_embed_timeout_seconds": settings.embedding_query_timeout_seconds,
            "hybrid_with_reranker": _metrics([r["rerank_rank"] for r in rows]),
            "hybrid_without_reranker": _metrics([r["no_rerank_rank"] for r in rows]),
            "cosine_only_baseline": _metrics([r["cosine_rank"] for r in rows]),
            "hinglish_queries": {
                "n": sum(1 for _, k in QUERIES if _is_hinglish(k)),
                "with_reranker": _metrics([r["rerank_rank"] for r in rows if _is_hinglish(r["expected"])]),
                "without_reranker": _metrics([r["no_rerank_rank"] for r in rows if _is_hinglish(r["expected"])]),
            },
            "latency_query_embedding": latency_stats([r["embed_ms"] for r in rows]),
            "latency_retrieve_with_reranker": latency_stats([r["rerank_ms"] for r in rows]),
            "latency_retrieve_without_reranker": latency_stats([r["no_rerank_ms"] for r in rows]),
            "rows": rows,
        }
    finally:
        db.rollback()
        db.execute(delete(Fact).where(Fact.user_id == user_id))
        db.execute(delete(Episode).where(Episode.user_id == user_id))
        db.execute(delete(User).where(User.id == user_id))
        db.commit()
        db.close()
        print(f"cleaned up eval user {user_id}")


HINGLISH_KEYS = {"F2", "F4", "F11", "F17", "E4", "E8", "E10"}


def _is_hinglish(key: str) -> bool:
    return key in HINGLISH_KEYS


if __name__ == "__main__":
    result = run()
    path = save("memory_eval", result)
    print({k: v for k, v in result.items() if k != "rows"})
    print(f"saved {path}")
