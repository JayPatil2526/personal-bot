"""Foreground agent graph — runs once per user message and streams the reply.

load_context → classify → safety_guard ─┬─► progress_update ─┐
                                         ├─► goal_validator ──┼─► web_search ─► goal_planner ─┐
                                         ├─► web_search ──────┘                               ├─► memory_retrieval ─► responder ─► post_process
                                         └─► (blocked / direct) ───────────────────────────────┘
The router re-evaluates after every tool node, so one message can trigger several tools.
"""
from __future__ import annotations

import operator
import re
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, TypedDict
from zoneinfo import ZoneInfo

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from sqlalchemy import select

from app.agents import llm, prompts
from app.agents.context import TurnContext, traced
from app.agents.schemas import ClassifierOutput, GoalPlan, GoalValidation
from app.agents.tools import web_search as run_web_search
from app.core.config import settings
from app.db.models import (
    AgentTrace,
    Character,
    CharacterAdaptation,
    CharacterBond,
    CharacterLifeEvent,
    CharacterNote,
    ChatSession,
    Commitment,
    Message,
    Milestone,
    MoodLog,
    Todo,
    User,
)
from app.memory.retrieval import retrieve
from app.services import goals as goal_svc


class ChatState(TypedDict, total=False):
    user_id: int
    session_id: int
    user_message: str
    user_message_id: int
    # context
    user: Any
    character: Any
    session: Any
    history: list[dict]
    goals_view: list[dict]
    focus_id: int | None
    notes: list[dict]
    others: list[dict]
    crew: list[dict]
    is_group: bool
    pending_promises: list[dict]
    followups: list[dict]
    now_str: str
    # classifier
    intent: str
    safety_level: str
    safety_reason: str
    goal_request: str
    progress_updates: list[dict]
    new_promises: list[dict]
    promise_updates: list[dict]
    needs_memory: bool
    memory_query: str
    needs_web_search: bool
    search_query: str
    mood: str
    mood_intensity: int
    contains_new_info: bool
    # tools
    validation: dict | None
    created_goal: dict | None
    search_results: list[dict]
    progress_results: list[dict]
    promise_results: list[dict]
    memories: list[dict]
    retrieval_meta: dict
    # output
    response: str
    replies: list[dict]
    assistant_message_id: int
    assistant_message_ids: list[int]
    chips: Annotated[list, operator.add]
    trace: Annotated[list, operator.add]
    route: Annotated[list, operator.add]


FOLLOW_UP_MIN_AGE = timedelta(minutes=2)  # don't ask about a promise in the same breath it was made

HARMFUL_PATTERNS = re.compile(
    r"\b(bomb|explosive|detonat|make (a )?gun|poison someone|kill (him|her|someone|people)|"
    r"hack (into )?(my )?(ex|friend|girlfriend|boyfriend|someone)'?s?|meth|ransomware)\b",
    re.I,
)

# ─────────────────────────── Nodes ───────────────────────────


@traced("load_context", "Loading context")
def load_context(state: ChatState, ctx: TurnContext) -> dict:
    db = ctx.db
    user = db.get(User, state["user_id"])
    session = db.get(ChatSession, state["session_id"])
    today = goal_svc.user_today(user)
    now_utc = datetime.now(timezone.utc)

    # Who speaks this turn: one character, or the whole preset crew in a group chat
    if session.is_group:
        crew_chars = list(db.scalars(select(Character).where(Character.is_preset.is_(True)).order_by(Character.id)).all())
    else:
        crew_chars = [session.character]
    crew_ids = {c.id for c in crew_chars}

    rows = db.scalars(
        select(Message)
        .where(Message.session_id == session.id, Message.id != state["user_message_id"])
        .order_by(Message.id.desc())
        .limit(settings.history_window)
    ).all()
    names = {c.id: c.name for c in crew_chars}
    history = [
        {"role": m.role, "content": m.content, "speaker": names.get((m.meta or {}).get("character_id"))}
        for m in reversed(rows)
    ]

    goals = goal_svc.load_goals(db, user.id)
    visible = [g for g in goals if session.is_group or goal_svc.visible_to(g, crew_chars[0].id)]
    goals_view = [goal_svc.goal_to_dict(g, today, detailed=True) for g in visible]
    focus = goal_svc.focus_goal(goals, today, None if session.is_group else crew_chars[0].id)

    notes_q = select(CharacterNote).where(CharacterNote.user_id == user.id)
    if not session.is_group:
        notes_q = notes_q.where(CharacterNote.character_id != crew_chars[0].id)
    notes = db.scalars(notes_q.order_by(CharacterNote.created_at.desc()).limit(6)).all()
    notes_view = [
        {"character": n.character.name, "note": n.note, "ago": prompts.time_ago(n.created_at, now_utc)} for n in notes
    ]

    others = db.scalars(
        select(Character).where(
            Character.id.not_in(crew_ids),
            (Character.is_preset.is_(True)) | (Character.owner_id == user.id),
        )
    ).all()
    others_view = [{"name": o.name, "avatar": o.avatar, "tagline": o.tagline} for o in others]

    crew = []
    for c in crew_chars:
        life_event = db.scalar(
            select(CharacterLifeEvent)
            .where(
                CharacterLifeEvent.character_id == c.id,
                CharacterLifeEvent.was_shared.is_(False),
                (CharacterLifeEvent.user_id.is_(None)) | (CharacterLifeEvent.user_id == user.id),
            )
            .order_by(CharacterLifeEvent.created_at.desc())
        )
        adaptations = db.scalars(
            select(CharacterAdaptation).where(CharacterAdaptation.user_id == user.id, CharacterAdaptation.character_id == c.id)
        ).all()
        bond = db.scalar(select(CharacterBond).where(CharacterBond.user_id == user.id, CharacterBond.character_id == c.id))
        if bond is None:
            bond = CharacterBond(user_id=user.id, character_id=c.id)
            db.add(bond)
            db.flush()
        crew.append({"character": c, "bond": bond, "life_event": life_event,
                     "adaptations": [{"topic": a.topic, "twist": a.twist} for a in adaptations]})

    # Promises: all pending ones (for the classifier) + due ones the crew should follow up on
    pending = db.scalars(
        select(Commitment).where(Commitment.user_id == user.id, Commitment.status == "pending").order_by(Commitment.due_date)
    ).all()
    pending_view = [
        {"id": p.id, "text": p.text, "due_date": p.due_date.isoformat(), "days_overdue": (today - p.due_date).days,
         "told_to": p.character.name if p.character else "the crew"}
        for p in pending
    ]
    followups = [
        pv for p, pv in zip(pending, pending_view)
        if p.due_date <= today and p.followed_up_at is None and now_utc - p.created_at > FOLLOW_UP_MIN_AGE
    ][:2]

    try:
        local_now = datetime.now(ZoneInfo(user.timezone))
    except Exception:  # noqa: BLE001
        local_now = datetime.now(timezone.utc)

    return {
        "user": user,
        "session": session,
        "character": crew_chars[0],
        "crew": crew,
        "is_group": session.is_group,
        "history": history,
        "goals_view": goals_view,
        "focus_id": focus.id if focus else None,
        "notes": notes_view,
        "others": others_view,
        "pending_promises": pending_view,
        "followups": followups,
        "now_str": local_now.strftime("%A, %d %B %Y, %I:%M %p"),
        "_note": f"{'group of ' + str(len(crew)) if session.is_group else crew_chars[0].name} · {len(history)} history msgs · "
        f"{len(goals_view)} goals · {len(notes_view)} crew notes · {len(pending_view)} pending promises "
        f"({len(followups)} to follow up)",
    }


@traced("classify", "Understanding intent")
def classify(state: ChatState, ctx: TurnContext) -> dict:
    history_text = "\n".join(f"{m.get('speaker') or m['role']}: {m['content'][:300]}" for m in state["history"][-6:])
    messages = [
        SystemMessage(prompts.CLASSIFIER_SYSTEM.format(
            todo_block=prompts.todo_block(state["goals_view"]),
            promise_block=prompts.promise_block(state.get("pending_promises", [])),
        )),
        HumanMessage(f"RECENT HISTORY:\n{history_text or '(new conversation)'}\n\nLATEST USER MESSAGE:\n{state['user_message']}"),
    ]
    out = llm.structured("classify", ClassifierOutput, messages, ctx.usage)

    valid_todos = {t["id"] for g in state["goals_view"] for t in g.get("todos", [])}
    valid_ms = {m["id"] for g in state["goals_view"] for m in g.get("milestones", [])}
    done_today = {t["id"] for g in state["goals_view"] for t in g.get("todos", []) if t["done_today"]}
    updates = [
        u.model_dump()
        for u in out.progress_updates
        if ((u.todo_id in valid_todos) or (u.milestone_id in valid_ms))
        # an "undo" only makes sense for a todo that is currently ticked
        and (u.done or u.todo_id in done_today)
    ]
    valid_promises = {p["id"] for p in state.get("pending_promises", [])}
    promise_updates = [u.model_dump() for u in out.promise_updates if u.promise_id in valid_promises]
    new_promises = [p.model_dump() for p in out.new_promises if p.text.strip()]
    needs_memory = out.needs_memory or out.intent in {
        "memory_question", "emotional", "goal_question", "progress_report", "new_goal"
    }
    return {
        "intent": out.intent,
        "safety_level": out.safety_level,
        "safety_reason": out.safety_reason,
        # A message that is only one-off promises is not a new goal, even if the classifier over-reaches
        "goal_request": (out.goal_request.strip() or state["user_message"])
        if out.intent == "new_goal" and not (new_promises and not out.goal_request.strip()) else "",
        "progress_updates": updates,
        "new_promises": new_promises,
        "promise_updates": promise_updates,
        "needs_memory": needs_memory,
        "memory_query": out.memory_query,
        "needs_web_search": out.needs_web_search,
        "search_query": out.search_query,
        "mood": out.mood,
        "mood_intensity": out.mood_intensity,
        "contains_new_info": out.contains_new_info,
        "_note": f"intent={out.intent} · safety={out.safety_level} · mood={out.mood} · memory={needs_memory} · "
        f"web={out.needs_web_search} · promises +{len(new_promises)}/~{len(promise_updates)}",
        "_detail": out.model_dump(),
    }


@traced("safety_guard", "Safety check")
def safety_guard(state: ChatState, ctx: TurnContext) -> dict:
    level = state.get("safety_level", "safe")
    keyword_hit = bool(HARMFUL_PATTERNS.search(state["user_message"]))
    if keyword_hit and level in ("safe", "dual_use"):
        level = "harmful"
    out: dict = {"safety_level": level}
    if level in ("harmful", "self_harm"):
        out["goal_request"] = ""
        out["needs_web_search"] = False
        chip = "🛡️ Blocked a harmful request" if level == "harmful" else "💙 Support mode on"
        out["chips"] = [{"type": "safety", "text": chip}]
    out["_note"] = f"level={level}" + (" (keyword rule)" if keyword_hit else "") + (f" · {state.get('safety_reason', '')}" if level != "safe" else "")
    return out


@traced("goal_validator", "Validating goal")
def goal_validator(state: ChatState, ctx: TurnContext) -> dict:
    today = goal_svc.user_today(state["user"])
    existing = ", ".join(g["title"] for g in state["goals_view"]) or "none"
    messages = [
        SystemMessage(prompts.VALIDATOR_SYSTEM.format(today=today.isoformat())),
        HumanMessage(
            f"Requested goal: {state['goal_request']}\nFull user message: {state['user_message']}\n"
            f"Safety pre-check: {state.get('safety_level')} ({state.get('safety_reason', '')})\nExisting goals: {existing}"
        ),
    ]
    v = llm.structured("validate", GoalValidation, messages, ctx.usage).model_dump()
    chips = []
    if v["tier"] == "refuse":
        chips.append({"type": "safety", "text": "🛡️ Goal refused (unsafe)"})
    elif v["tier"] == "reframe":
        chips.append({"type": "goal", "text": f"🔁 Reframed → {v['title']}"})
    return {
        "validation": v,
        "chips": chips,
        "_note": f"tier={v['tier']} · feasibility={v['feasibility']:.2f} · {v['reason'][:120]}",
        "_detail": v,
    }


@traced("web_search", "Searching the web")
def web_search(state: ChatState, ctx: TurnContext) -> dict:
    v = state.get("validation") or {}
    query = state.get("search_query") or v.get("search_query") or state.get("goal_request") or state["user_message"]
    results = run_web_search(query)
    return {
        "search_results": results,
        "chips": [{"type": "web", "text": f"🌐 Searched: {query[:50]}"}] if results else [],
        "_note": f"query='{query}' · {len(results)} results",
        "_detail": results,
    }


@traced("goal_planner", "Planning goal")
def goal_planner(state: ChatState, ctx: TurnContext) -> dict:
    db = ctx.db
    user = state["user"]
    v = state["validation"]
    today = goal_svc.user_today(user)
    results = state.get("search_results") or []
    web = "\n".join(f"- {r['title']}: {r['snippet']}" for r in results[:5]) or "none"
    messages = [
        SystemMessage(prompts.PLANNER_SYSTEM.format(today=today.isoformat())),
        HumanMessage(
            f"Goal: {v['title']}\nCategory: {v['category']}\nTimeframe: {v['suggested_deadline_days']} days\n"
            f"Why/notes: {v['reason']}\nUser said: {state['user_message']}\nWeb results:\n{web}"
        ),
    ]
    plan = llm.structured("plan", GoalPlan, messages, ctx.usage)
    goal = goal_svc.create_goal(
        db,
        user,
        title=v["title"],
        description=plan.description,
        category=v["category"],
        priority=v["suggested_priority"],
        deadline=today + timedelta(days=v["suggested_deadline_days"]),
        milestones=plan.milestones,
        todos=[t.model_dump() for t in plan.todos],
        feasibility=v["feasibility"],
        safety_tier="reframed" if v["tier"] == "reframe" else "safe",
        validation_note=v["reason"] + (f" Expert advice: {v['expert_advice']}" if v.get("expert_advice") else ""),
        original_request=state["goal_request"],
        created_via="chat",
        created_by_character_id=state["character"].id,
        sources=results[:5],
    )
    db.commit()
    goal_view = goal_svc.goal_to_dict(goal, today, detailed=True)
    return {
        "created_goal": goal_view,
        "goals_view": state["goals_view"] + [goal_view],
        "chips": [{"type": "goal", "text": f"🎯 New goal: {goal.title}"}],
        "_note": f"goal #{goal.id} · {len(plan.milestones)} milestones · {len(plan.todos)} todos",
        "_detail": plan.model_dump(),
    }


@traced("progress_update", "Updating progress")
def progress_update(state: ChatState, ctx: TurnContext) -> dict:
    db = ctx.db
    user = state["user"]
    results, chips = [], []
    for u in state.get("progress_updates", []):
        if u.get("todo_id"):
            todo = db.get(Todo, u["todo_id"])
            if not todo or todo.user_id != user.id:
                continue
            r = goal_svc.set_todo_done(db, user, todo, u.get("done", True), source="chat")
            label = todo.title
        elif u.get("milestone_id"):
            ms = db.get(Milestone, u["milestone_id"])
            if not ms or ms.goal.user_id != user.id:
                continue
            r = goal_svc.set_milestone_done(db, user, ms, u.get("done", True), source="chat")
            label = f"Milestone: {ms.title}"
        else:
            continue
        goal_title = next((g["title"] for g in state["goals_view"] if g["id"] == r["goal_id"]), "")
        results.append({**r, "label": label, "goal_title": goal_title})
        sign = "+" if r["delta"] >= 0 else ""
        icon = "✅" if r["done"] else "↩️"
        chips.append({"type": "progress", "text": f"{icon} {label} · {sign}{r['delta']}%"})
    db.commit()
    today = goal_svc.user_today(user)
    refreshed = [
        goal_svc.goal_to_dict(g, today, detailed=True)
        for g in goal_svc.load_goals(db, user.id)
        if goal_svc.visible_to(g, state["character"].id)
    ]
    return {"progress_results": results, "goals_view": refreshed, "chips": chips, "_note": f"{len(results)} updates applied"}


@traced("commitments", "Tracking promises")
def commitments(state: ChatState, ctx: TurnContext) -> dict:
    db = ctx.db
    user = state["user"]
    today = goal_svc.user_today(user)
    chips, results = [], []
    for p in state.get("new_promises", []):
        due = today + timedelta(days=p["due_in_days"])
        c = Commitment(user_id=user.id, character_id=None if state["is_group"] else state["character"].id,
                       session_id=state["session_id"], text=p["text"][:300], due_date=due)
        db.add(c)
        when = "today" if p["due_in_days"] == 0 else "tomorrow" if p["due_in_days"] == 1 else due.strftime("%a %d %b")
        chips.append({"type": "promise", "text": f"🤝 Promise saved: {p['text'][:50]} · due {when}"})
        results.append({"kind": "new", "text": p["text"], "due": due.isoformat()})
    for u in state.get("promise_updates", []):
        c = db.get(Commitment, u["promise_id"])
        if not c or c.user_id != user.id:
            continue
        c.status = "kept" if u["kept"] else "broken"
        c.resolved_at = datetime.now(timezone.utc)
        chips.append({"type": "promise", "text": f"{'✅ Promise kept' if u['kept'] else '💔 Promise missed'}: {c.text[:50]}"})
        results.append({"kind": c.status, "text": c.text})
    db.commit()
    return {"promise_results": results, "chips": chips, "_note": f"{len(results)} promise changes", "_detail": results}


@traced("memory_retrieval", "Recalling memories")
def memory_retrieval(state: ChatState, ctx: TurnContext) -> dict:
    query = state.get("memory_query") or state["user_message"]
    res = retrieve(ctx.db, state["user_id"], query)
    chips = [{"type": "memory", "text": f"🧠 Recalled {len(res.items)} memories"}] if res.items else []
    return {
        "memories": res.items,
        "retrieval_meta": {"query": query, "vector": res.used_vector, "reranker": res.used_reranker, "candidates": res.candidates},
        "chips": chips,
        "_note": f"query='{query[:60]}' · {res.candidates} candidates → top {len(res.items)} · "
        f"vector={res.used_vector} · rerank={res.used_reranker}",
        "_detail": res.items,
    }


GROUP_LEAD_KEYWORDS = {
    "Arjun": ("gym", "workout", "water", "run", "fitness", "diet", "weight", "exercise", "sleep", "health", "protein"),
    "Meera": ("stress", "sad", "tired", "anxious", "feel", "calm", "routine", "journal", "overwhelm", "lonely", "rest"),
    "Kabir": ("money", "invest", "sip", "stock", "ipo", "career", "job", "salary", "learn", "course", "hack", "fund"),
}


def _speaking_order(state: ChatState) -> list[dict]:
    """In a group chat the most relevant character answers first; the others react."""
    crew = list(state["crew"])
    if len(crew) < 2:
        return crew
    text = state["user_message"].lower()
    scores = {name: sum(k in text for k in kws) for name, kws in GROUP_LEAD_KEYWORDS.items()}
    crew.sort(key=lambda m: -scores.get(m["character"].name, 0))
    return crew


@traced("responder", "Writing reply")
def responder(state: ChatState, ctx: TurnContext) -> dict:
    user: User = state["user"]
    situation = prompts.situation_for(state)
    order = _speaking_order(state)
    replies: list[dict] = []

    for member in order:
        c: Character = member["character"]
        life = member["life_event"]
        prompt_ctx = {
            "character": {
                "name": c.name, "age": c.age, "occupation": c.occupation, "city": c.city, "personality": c.personality,
                "speaking_style": c.speaking_style, "motivation_style": c.motivation_style, "backstory": c.backstory,
                "worldview": c.worldview, "family_friends": c.family_friends, "interests": c.interests,
            },
            "user_name": user.name.split()[0],
            "others": state.get("others", []) if not state["is_group"] else
            [{"name": m["character"].name, "avatar": m["character"].avatar, "tagline": m["character"].tagline}
             for m in state["crew"] if m["character"].id != c.id],
            "notes": state.get("notes", []),
            "adaptations": member["adaptations"],
            "life_event": {"title": life.title, "description": life.description} if life else None,
            "patterns": user.patterns,
            "bond_level": member["bond"].bond_level,
            "bond_messages": member["bond"].messages_count,
            "mood": state.get("mood", "neutral"),
            "mood_intensity": state.get("mood_intensity", 5),
            "memories": state.get("memories", []),
            "goals_view": state.get("goals_view", []),
            "focus_id": state.get("focus_id"),
            "situation": situation,
            "now_str": state["now_str"],
            "group": prompts.group_block(c.name, replies) if state["is_group"] else "",
        }
        messages = [SystemMessage(prompts.responder_system(prompt_ctx))]
        for m in state["history"]:
            if m["role"] == "user":
                messages.append(HumanMessage(m["content"]))
            elif state["is_group"]:
                messages.append(AIMessage(f"[{m.get('speaker') or 'crew'}]: {m['content']}" if m.get("speaker") != c.name else m["content"]))
            else:
                messages.append(AIMessage(m["content"]))
        messages.append(HumanMessage(state["user_message"]))

        ctx.emit("speaker", {"character_id": c.id, "name": c.name, "avatar": c.avatar, "color": c.color})
        try:
            text = llm.stream("reply", messages, lambda t, cid=c.id: ctx.emit("token", {"text": t, "character_id": cid}), ctx.usage)
        except llm.LLMUnavailable:
            text = "Ugh, my network just dropped for a sec 😅 Can you send that again?"
            ctx.emit("token", {"text": text, "character_id": c.id})
        text = prompts.strip_speaker_prefix(text.strip(), c.name)
        replies.append({"character_id": c.id, "name": c.name, "text": text})

    return {
        "replies": replies,
        "response": "\n\n".join(f"{r['name']}: {r['text']}" if state["is_group"] else r["text"] for r in replies),
        "_note": f"{len(replies)} speaker(s): {', '.join(r['name'] for r in replies)} · {sum(len(r['text']) for r in replies)} chars",
    }


@traced("post_process", "Saving turn")
def post_process(state: ChatState, ctx: TurnContext) -> dict:
    db = ctx.db
    session: ChatSession = state["session"]
    cards = []
    if state.get("created_goal"):
        cards.append({"type": "goal", "goal": state["created_goal"], "validation": state.get("validation")})
    elif state.get("validation") and state["validation"]["tier"] == "refuse":
        cards.append({"type": "refused", "validation": state["validation"]})
    replies = state.get("replies", [])
    ids = []
    for i, r in enumerate(replies):
        first = i == 0
        msg = Message(
            session_id=session.id,
            role="assistant",
            content=r["text"],
            meta={
                "character_id": r["character_id"],
                "chips": state.get("chips", []) if first else [],
                "cards": cards if first else [],
                "sources": state.get("search_results", [])[:5] if first else [],
                "progress": state.get("progress_results", []) if first else [],
                "intent": state.get("intent"),
                "mood": state.get("mood"),
            },
        )
        db.add(msg)
        db.flush()
        ids.append(msg.id)
    if state.get("mood"):
        db.add(MoodLog(user_id=state["user_id"], character_id=state["character"].id, mood=state["mood"],
                       intensity=state.get("mood_intensity", 5)))
    now = datetime.now(timezone.utc)
    spoke = {r["character_id"] for r in replies}
    for member in state["crew"]:
        if member["character"].id not in spoke:
            continue
        bond: CharacterBond = member["bond"]
        bond.messages_count += 1
        bond.last_chat_at = now
        bond.bond_level = "close" if bond.messages_count >= 60 else "friend" if bond.messages_count >= 16 else "new"
        if member["life_event"] is not None:
            member["life_event"].was_shared = True
    for f in state.get("followups", []):
        c = db.get(Commitment, f["id"])
        if c and c.followed_up_at is None:
            c.followed_up_at = now
            c.followed_up_by = replies[0]["character_id"] if replies else None
    session.updated_at = now
    if session.title in ("New chat", "Crew huddle"):
        session.title = state["user_message"][:48] + ("…" if len(state["user_message"]) > 48 else "")
    db.commit()
    return {"assistant_message_id": ids[0] if ids else None, "assistant_message_ids": ids,
            "_note": f"{len(ids)} message(s) saved"}


# ─────────────────────────── Routing ───────────────────────────

TOOL_NODES = ["progress_update", "commitments", "goal_validator", "web_search", "goal_planner", "memory_retrieval", "responder"]


def next_step(state: ChatState) -> str:
    visited = set(state.get("route", []))
    if state.get("safety_level") in ("harmful", "self_harm"):
        return "responder"
    if state.get("progress_updates") and "progress_update" not in visited:
        return "progress_update"
    if (state.get("new_promises") or state.get("promise_updates")) and "commitments" not in visited:
        return "commitments"
    if state.get("goal_request") and "goal_validator" not in visited:
        return "goal_validator"
    v = state.get("validation")
    refused = bool(v and v["tier"] == "refuse")
    wants_search = state.get("needs_web_search") or bool(v and v.get("needs_web_search"))
    if wants_search and not refused and "web_search" not in visited:
        return "web_search"
    if v and not refused and "goal_planner" not in visited:
        return "goal_planner"
    if state.get("needs_memory") and "memory_retrieval" not in visited:
        return "memory_retrieval"
    return "responder"


def build_graph():
    g = StateGraph(ChatState)
    for name, fn in [
        ("load_context", load_context), ("classify", classify), ("safety_guard", safety_guard),
        ("progress_update", progress_update), ("commitments", commitments), ("goal_validator", goal_validator), ("web_search", web_search),
        ("goal_planner", goal_planner), ("memory_retrieval", memory_retrieval), ("responder", responder),
        ("post_process", post_process),
    ]:
        g.add_node(name, fn)
    g.set_entry_point("load_context")
    g.add_edge("load_context", "classify")
    g.add_edge("classify", "safety_guard")
    path_map = {n: n for n in TOOL_NODES}
    for node in ["safety_guard", "progress_update", "commitments", "goal_validator", "web_search", "goal_planner", "memory_retrieval"]:
        g.add_conditional_edges(node, next_step, path_map)
    g.add_edge("responder", "post_process")
    g.add_edge("post_process", END)
    return g.compile()


chat_graph = build_graph()


GRAPH_SPEC = {
    "foreground": {
        "nodes": ["load_context", "classify", "safety_guard", *TOOL_NODES, "post_process"],
        "edges": [
            ["load_context", "classify"], ["classify", "safety_guard"],
            ["safety_guard", "progress_update"], ["safety_guard", "goal_validator"], ["safety_guard", "web_search"],
            ["safety_guard", "memory_retrieval"], ["safety_guard", "responder"],
            ["progress_update", "goal_validator"], ["progress_update", "web_search"], ["progress_update", "memory_retrieval"],
            ["progress_update", "responder"], ["progress_update", "commitments"],
            ["safety_guard", "commitments"], ["commitments", "goal_validator"], ["commitments", "web_search"],
            ["commitments", "memory_retrieval"], ["commitments", "responder"],
            ["goal_validator", "web_search"], ["goal_validator", "goal_planner"], ["goal_validator", "memory_retrieval"],
            ["goal_validator", "responder"],
            ["web_search", "goal_planner"], ["web_search", "memory_retrieval"], ["web_search", "responder"],
            ["goal_planner", "memory_retrieval"], ["goal_planner", "responder"],
            ["memory_retrieval", "responder"], ["responder", "post_process"],
        ],
    },
}


def save_trace(db, state: dict, usage: llm.Usage, kind: str = "chat") -> AgentTrace:
    nodes = state.get("trace", [])
    trace = AgentTrace(
        user_id=state["user_id"],
        session_id=state.get("session_id"),
        message_id=state.get("assistant_message_id"),
        kind=kind,
        user_message=state.get("user_message", ""),
        nodes=nodes,
        route=state.get("route", []),
        retrieved=state.get("memories", []),
        total_ms=round(sum(n["ms"] for n in nodes), 1),
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        providers=usage.providers,
    )
    db.add(trace)
    db.commit()
    return trace
