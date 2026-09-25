"""Background memory graph — runs after the reply is streamed.

bg_input decides which jobs are due, then a job router executes them one by one:
  extraction   – episode + facts (dedup against existing memories) + cross-character note
  compression  – merge a category's facts when it grows too large
  behaviour    – learn how the user talks / what motivates them (every N messages)
  adaptation   – character picks up one of the user's interests (every N messages with that character)
  life_event   – the character's own life moves on
  reflection   – weekly reflection episode
"""
from __future__ import annotations

import operator
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from sqlalchemy import func, select

from app.agents import llm, prompts
from app.agents.context import TurnContext, traced
from app.agents.schemas import (
    AdaptationOutput,
    BehaviourOutput,
    ExtractionOutput,
    LifeEventOutput,
    MergedFacts,
    ReflectionOutput,
)
from app.core.config import settings
from app.db.models import (
    Character,
    CharacterAdaptation,
    CharacterBond,
    CharacterLifeEvent,
    CharacterNote,
    ChatSession,
    Episode,
    Fact,
    Message,
    MoodLog,
    User,
)
from app.memory.embeddings import embed_many, embed_text
from app.services import goals as goal_svc

DUPLICATE_DISTANCE = 0.12  # cosine distance under which a new fact updates an existing one
SAME_FACT_DISTANCE = 0.04  # practically identical restatement


class BgState(TypedDict, total=False):
    user_id: int
    session_id: int
    character_id: int
    user_message: str
    assistant_message: str
    intent: str
    contains_new_info: bool
    jobs: list[str]
    user: Any
    character: Any
    chips: Annotated[list, operator.add]
    trace: Annotated[list, operator.add]
    route: Annotated[list, operator.add]


def _pop(state: BgState) -> list[str]:
    return state.get("jobs", [])[1:]


@traced("bg_input", "Planning memory jobs", phase="background")
def bg_input(state: BgState, ctx: TurnContext) -> dict:
    db = ctx.db
    user = db.get(User, state["user_id"])
    character = db.get(Character, state["character_id"])
    jobs: list[str] = []

    user_msgs_in_session = db.scalar(
        select(func.count(Message.id)).where(Message.session_id == state["session_id"], Message.role == "user")
    ) or 0
    intent = state.get("intent")
    if state.get("contains_new_info") or intent not in ("chit_chat", "memory_question") or user_msgs_in_session % 4 == 0:
        jobs.append("extraction")

    per_category = db.execute(
        select(Fact.category, func.count(Fact.id)).where(Fact.user_id == user.id).group_by(Fact.category)
    ).all()
    if any(count >= max(5, settings.fact_compression_threshold // 2 + 1) for _, count in per_category):
        jobs.append("compression")

    total_user_msgs = db.scalar(
        select(func.count(Message.id)).join(ChatSession).where(ChatSession.user_id == user.id, Message.role == "user")
    ) or 0
    if total_user_msgs - (user.patterns or {}).get("analyzed_msg_count", 0) >= settings.behaviour_interval_msgs:
        jobs.append("behaviour")

    bond = db.scalar(select(CharacterBond).where(CharacterBond.user_id == user.id, CharacterBond.character_id == character.id))
    if bond and bond.messages_count and bond.messages_count % settings.adaptation_interval_msgs == 0:
        jobs.append("adaptation")

    unshared = db.scalar(
        select(func.count(CharacterLifeEvent.id)).where(
            CharacterLifeEvent.character_id == character.id,
            CharacterLifeEvent.was_shared.is_(False),
            (CharacterLifeEvent.user_id.is_(None)) | (CharacterLifeEvent.user_id == user.id),
        )
    )
    last_event = db.scalar(
        select(func.max(CharacterLifeEvent.created_at)).where(CharacterLifeEvent.character_id == character.id)
    )
    if not unshared and (last_event is None or datetime.now(timezone.utc) - last_event > timedelta(hours=12)):
        jobs.append("life_event")

    last_reflection = db.scalar(
        select(func.max(Episode.occurred_at)).where(Episode.user_id == user.id, Episode.kind == "reflection")
    )
    episode_count = db.scalar(select(func.count(Episode.id)).where(Episode.user_id == user.id)) or 0
    if episode_count >= 6 and (last_reflection is None or datetime.now(timezone.utc) - last_reflection > timedelta(days=7)):
        jobs.append("reflection")

    return {"user": user, "character": character, "jobs": jobs, "_note": f"jobs={jobs or 'none'}"}


@traced("extraction", "Writing memories", phase="background")
def extraction(state: BgState, ctx: TurnContext) -> dict:
    db = ctx.db
    user: User = state["user"]
    character: Character = state["character"]
    known = db.scalars(select(Fact).where(Fact.user_id == user.id).order_by(Fact.updated_at.desc()).limit(40)).all()
    known_text = "\n".join(f"- {f.fact}" for f in known) or "(none yet)"
    messages = [
        SystemMessage(prompts.EXTRACTOR_SYSTEM.format(
            user_name=user.name.split()[0], character_name=character.name, known_facts=known_text)),
        HumanMessage(f"User: {state['user_message']}\n{character.name}: {state['assistant_message']}"),
    ]
    out = llm.structured("extract", ExtractionOutput, messages, ctx.usage)
    chips, notes = [], []

    if out.has_episode and out.episode_summary.strip():
        db.add(Episode(
            user_id=user.id, character_id=character.id, session_id=state["session_id"], summary=out.episode_summary.strip(),
            emotion=out.episode_emotion, importance=out.episode_importance, keywords=out.episode_keywords,
            embedding=embed_text(out.episode_summary),
        ))
        notes.append("episode")

    vectors = embed_many([f.fact for f in out.facts]) if out.facts else []
    for f, vec in zip(out.facts, vectors):
        existing = None
        if vec is not None:
            dist = Fact.embedding.cosine_distance(vec)
            row = db.execute(
                select(Fact, dist.label("d")).where(Fact.user_id == user.id, Fact.embedding.is_not(None)).order_by(dist).limit(1)
            ).first()
            if row and row.d < DUPLICATE_DISTANCE:
                existing = row[0]
                if row.d < SAME_FACT_DISTANCE:
                    # Same fact restated — just refresh it silently
                    existing.updated_at = datetime.now(timezone.utc)
                    continue
        if existing:
            existing.fact = f.fact
            existing.confidence = max(existing.confidence, f.confidence)
            existing.keywords = list({*(existing.keywords or []), *f.keywords})[:8]
            existing.embedding = vec
            existing.times_updated += 1
            existing.updated_at = datetime.now(timezone.utc)
            chips.append({"type": "memory", "text": f"🧠 Updated: {f.fact[:60]}"})
        else:
            db.add(Fact(
                user_id=user.id, fact=f.fact, category=f.category.lower(), kind=f.kind, confidence=f.confidence,
                keywords=f.keywords, source_session_id=state["session_id"], source_character_id=character.id, embedding=vec,
            ))
            chips.append({"type": "memory", "text": f"🧠 Remembered: {f.fact[:60]}"})
    if out.character_note.strip():
        db.add(CharacterNote(user_id=user.id, character_id=character.id, note=out.character_note.strip()))
        chips.append({"type": "crew", "text": "🤝 Shared with your crew"})
        notes.append("crew note")
    db.commit()
    return {
        "jobs": _pop(state),
        "chips": chips,
        "_note": f"{len(out.facts)} facts · " + (", ".join(notes) or "no episode"),
        "_detail": out.model_dump(),
    }


@traced("compression", "Compressing memory", phase="background")
def compression(state: BgState, ctx: TurnContext) -> dict:
    db = ctx.db
    user: User = state["user"]
    grouped: dict[str, list[Fact]] = defaultdict(list)
    for f in db.scalars(select(Fact).where(Fact.user_id == user.id)).all():
        grouped[f.category].append(f)
    threshold = max(5, settings.fact_compression_threshold // 2 + 1)
    merged_total, removed_total = 0, 0
    for category, facts in grouped.items():
        if len(facts) < threshold:
            continue
        listing = "\n".join(f"- {f.fact} (updated {f.updated_at.date()})" for f in facts)
        out = llm.structured("merge", MergedFacts, [SystemMessage(prompts.MERGE_SYSTEM), HumanMessage(listing)], ctx.usage)
        if not out.facts or len(out.facts) >= len(facts):
            continue
        vectors = embed_many([m.fact for m in out.facts])
        for f in facts:
            db.delete(f)
        for m, vec in zip(out.facts, vectors):
            db.add(Fact(user_id=user.id, fact=m.fact, category=category, kind=m.kind, confidence=m.confidence,
                        keywords=m.keywords, embedding=vec))
        merged_total += len(out.facts)
        removed_total += len(facts)
    db.commit()
    chips = [{"type": "memory", "text": f"🗜️ Compressed {removed_total} → {merged_total} memories"}] if removed_total else []
    return {"jobs": _pop(state), "chips": chips, "_note": f"{removed_total} facts merged into {merged_total}"}


@traced("behaviour", "Learning your patterns", phase="background")
def behaviour(state: BgState, ctx: TurnContext) -> dict:
    db = ctx.db
    user: User = state["user"]
    rows = db.execute(
        select(Message.content, Message.created_at).join(ChatSession)
        .where(ChatSession.user_id == user.id, Message.role == "user")
        .order_by(Message.id.desc()).limit(40)
    ).all()
    listing = "\n".join(f"- {c[:200]}" for c, _ in reversed(rows))
    out = llm.structured("behaviour", BehaviourOutput, [SystemMessage(prompts.BEHAVIOUR_SYSTEM), HumanMessage(listing)], ctx.usage)
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo(user.timezone)
    except Exception:  # noqa: BLE001
        tz = timezone.utc
    hours = Counter(ts.astimezone(tz).hour for _, ts in rows)
    total = db.scalar(
        select(func.count(Message.id)).join(ChatSession).where(ChatSession.user_id == user.id, Message.role == "user")
    ) or 0
    user.patterns = {
        **out.model_dump(),
        "active_hours": [h for h, _ in hours.most_common(3)],
        "analyzed_msg_count": total,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }
    db.commit()
    return {"jobs": _pop(state), "chips": [{"type": "memory", "text": f"📊 Learned: you respond best to {out.motivation_style} motivation"}],
            "_note": out.summary[:140], "_detail": user.patterns}


@traced("adaptation", "Character adapting", phase="background")
def adaptation(state: BgState, ctx: TurnContext) -> dict:
    db = ctx.db
    user: User = state["user"]
    c: Character = state["character"]
    existing = db.scalars(select(CharacterAdaptation).where(
        CharacterAdaptation.user_id == user.id, CharacterAdaptation.character_id == c.id)).all()
    facts = db.scalars(select(Fact).where(Fact.user_id == user.id).limit(30)).all()
    goals = goal_svc.load_goals(db, user.id)
    listing = "User facts:\n" + "\n".join(f"- {f.fact}" for f in facts) + "\nUser goals:\n" + "\n".join(f"- {g.title}" for g in goals)
    out = llm.structured("creative", AdaptationOutput, [
        SystemMessage(prompts.ADAPTATION_SYSTEM.format(
            character_name=c.name, personality=c.personality, interests=", ".join(c.interests or []),
            existing=", ".join(a.topic for a in existing) or "none")),
        HumanMessage(listing),
    ], ctx.usage)
    chips = []
    if out.should_adapt and out.topic and out.topic.lower() not in {a.topic.lower() for a in existing}:
        db.add(CharacterAdaptation(user_id=user.id, character_id=c.id, topic=out.topic, twist=out.twist))
        db.commit()
        chips.append({"type": "crew", "text": f"✨ {c.name} picked up: {out.topic}"})
    return {"jobs": _pop(state), "chips": chips, "_note": f"adapt={out.should_adapt} · {out.topic}"}


@traced("life_event", "Character's life moves on", phase="background")
def life_event(state: BgState, ctx: TurnContext) -> dict:
    db = ctx.db
    c: Character = state["character"]
    recent = db.scalars(select(CharacterLifeEvent).where(CharacterLifeEvent.character_id == c.id)
                        .order_by(CharacterLifeEvent.created_at.desc()).limit(5)).all()
    people = "; ".join(f"{p.get('name')} ({p.get('relation')})" for p in c.family_friends or [])
    out = llm.structured("creative", LifeEventOutput, [
        SystemMessage(prompts.LIFE_EVENT_SYSTEM.format(
            character_name=c.name, occupation=c.occupation, city=c.city, personality=c.personality, people=people,
            recent="; ".join(e.title for e in recent) or "none")),
        HumanMessage("Generate today's event."),
    ], ctx.usage)
    db.add(CharacterLifeEvent(character_id=c.id, user_id=state["user_id"], title=out.title,
                              description=out.description, emotion=out.emotion))
    db.commit()
    return {"jobs": _pop(state), "_note": out.title}


@traced("reflection", "Weekly reflection", phase="background")
def reflection(state: BgState, ctx: TurnContext) -> dict:
    db = ctx.db
    user: User = state["user"]
    since = datetime.now(timezone.utc) - timedelta(days=7)
    episodes = db.scalars(select(Episode).where(Episode.user_id == user.id, Episode.occurred_at >= since)
                          .order_by(Episode.occurred_at)).all()
    moods = db.scalars(select(MoodLog).where(MoodLog.user_id == user.id, MoodLog.created_at >= since)).all()
    goals = goal_svc.load_goals(db, user.id, status=None)
    listing = (
        "Memories:\n" + "\n".join(f"- {e.occurred_at.date()}: {e.summary}" for e in episodes)
        + "\nMoods: " + ", ".join(m.mood for m in moods)
        + "\nGoals: " + "; ".join(f"{g.title} {g.progress:.0f}% streak {g.streak_current}" for g in goals)
    )
    out = llm.structured("extract", ReflectionOutput, [SystemMessage(prompts.REFLECTION_SYSTEM), HumanMessage(listing)], ctx.usage)
    db.add(Episode(user_id=user.id, character_id=None, summary=out.summary, emotion=out.emotion, importance=7,
                   kind="reflection", keywords=out.keywords, embedding=embed_text(out.summary)))
    db.commit()
    return {"jobs": _pop(state), "chips": [{"type": "memory", "text": "🪞 Weekly reflection saved"}], "_note": out.summary[:140]}


JOBS = ["extraction", "compression", "behaviour", "adaptation", "life_event", "reflection"]


def route_job(state: BgState) -> str:
    # Skip jobs that already ran (even if they failed and could not pop themselves)
    visited = set(state.get("route", []))
    return next((j for j in state.get("jobs") or [] if j not in visited), END)


def _job_router(state: BgState, config: dict) -> dict:
    return {}


def build_background_graph():
    g = StateGraph(BgState)
    g.add_node("bg_input", bg_input)
    g.add_node("job_router", _job_router)
    for name, fn in [("extraction", extraction), ("compression", compression), ("behaviour", behaviour),
                     ("adaptation", adaptation), ("life_event", life_event), ("reflection", reflection)]:
        g.add_node(name, fn)
        g.add_edge(name, "job_router")
    g.set_entry_point("bg_input")
    g.add_edge("bg_input", "job_router")
    g.add_conditional_edges("job_router", route_job, {**{j: j for j in JOBS}, END: END})
    return g.compile()


background_graph = build_background_graph()

BACKGROUND_SPEC = {
    "nodes": ["bg_input", "job_router", *JOBS],
    "edges": [["bg_input", "job_router"], *[["job_router", j] for j in JOBS], *[[j, "job_router"] for j in JOBS]],
}
