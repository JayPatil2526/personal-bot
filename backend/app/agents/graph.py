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
    life_event: Any
    adaptations: list[dict]
    bond: Any
    now_str: str
    # classifier
    intent: str
    safety_level: str
    safety_reason: str
    goal_request: str
    progress_updates: list[dict]
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
    memories: list[dict]
    retrieval_meta: dict
    # output
    response: str
    assistant_message_id: int
    chips: Annotated[list, operator.add]
    trace: Annotated[list, operator.add]
    route: Annotated[list, operator.add]


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
    character: Character = session.character
    today = goal_svc.user_today(user)

    rows = db.scalars(
        select(Message)
        .where(Message.session_id == session.id, Message.id != state["user_message_id"])
        .order_by(Message.id.desc())
        .limit(settings.history_window)
    ).all()
    history = [{"role": m.role, "content": m.content} for m in reversed(rows)]

    goals = goal_svc.load_goals(db, user.id)
    visible = [g for g in goals if goal_svc.visible_to(g, character.id)]
    goals_view = [goal_svc.goal_to_dict(g, today, detailed=True) for g in visible]
    focus = goal_svc.focus_goal(goals, today, character.id)

    now_utc = datetime.now(timezone.utc)
    notes = db.scalars(
        select(CharacterNote)
        .where(CharacterNote.user_id == user.id, CharacterNote.character_id != character.id)
        .order_by(CharacterNote.created_at.desc())
        .limit(6)
    ).all()
    notes_view = [
        {"character": n.character.name, "note": n.note, "ago": prompts.time_ago(n.created_at, now_utc)} for n in notes
    ]

    others = db.scalars(
        select(Character).where(
            Character.id != character.id,
            (Character.is_preset.is_(True)) | (Character.owner_id == user.id),
        )
    ).all()
    others_view = [{"name": o.name, "avatar": o.avatar, "tagline": o.tagline} for o in others]

    life_event = db.scalar(
        select(CharacterLifeEvent)
        .where(
            CharacterLifeEvent.character_id == character.id,
            CharacterLifeEvent.was_shared.is_(False),
            (CharacterLifeEvent.user_id.is_(None)) | (CharacterLifeEvent.user_id == user.id),
        )
        .order_by(CharacterLifeEvent.created_at.desc())
    )
    adaptations = db.scalars(
        select(CharacterAdaptation).where(
            CharacterAdaptation.user_id == user.id, CharacterAdaptation.character_id == character.id
        )
    ).all()

    bond = db.scalar(
        select(CharacterBond).where(CharacterBond.user_id == user.id, CharacterBond.character_id == character.id)
    )
    if bond is None:
        bond = CharacterBond(user_id=user.id, character_id=character.id)
        db.add(bond)
        db.flush()

    try:
        local_now = datetime.now(ZoneInfo(user.timezone))
    except Exception:  # noqa: BLE001
        local_now = datetime.now(timezone.utc)

    return {
        "user": user,
        "session": session,
        "character": character,
        "history": history,
        "goals_view": goals_view,
        "focus_id": focus.id if focus else None,
        "notes": notes_view,
        "others": others_view,
        "life_event": life_event,
        "adaptations": [{"topic": a.topic, "twist": a.twist} for a in adaptations],
        "bond": bond,
        "now_str": local_now.strftime("%A, %d %B %Y, %I:%M %p"),
        "_note": f"{len(history)} history msgs · {len(goals_view)} goals · {len(notes_view)} crew notes · bond={bond.bond_level}",
    }


@traced("classify", "Understanding intent")
def classify(state: ChatState, ctx: TurnContext) -> dict:
    history_text = "\n".join(f"{m['role']}: {m['content'][:300]}" for m in state["history"][-6:])
    messages = [
        SystemMessage(prompts.CLASSIFIER_SYSTEM.format(todo_block=prompts.todo_block(state["goals_view"]))),
        HumanMessage(f"RECENT HISTORY:\n{history_text or '(new conversation)'}\n\nLATEST USER MESSAGE:\n{state['user_message']}"),
    ]
    out = llm.structured("classify", ClassifierOutput, messages, ctx.usage)

    valid_todos = {t["id"] for g in state["goals_view"] for t in g.get("todos", [])}
    valid_ms = {m["id"] for g in state["goals_view"] for m in g.get("milestones", [])}
    updates = [
        u.model_dump()
        for u in out.progress_updates
        if (u.todo_id in valid_todos) or (u.milestone_id in valid_ms)
    ]
    needs_memory = out.needs_memory or out.intent in {
        "memory_question", "emotional", "goal_question", "progress_report", "new_goal"
    }
    return {
        "intent": out.intent,
        "safety_level": out.safety_level,
        "safety_reason": out.safety_reason,
        "goal_request": (out.goal_request.strip() or state["user_message"]) if out.intent == "new_goal" else "",
        "progress_updates": updates,
        "needs_memory": needs_memory,
        "memory_query": out.memory_query,
        "needs_web_search": out.needs_web_search,
        "search_query": out.search_query,
        "mood": out.mood,
        "mood_intensity": out.mood_intensity,
        "contains_new_info": out.contains_new_info,
        "_note": f"intent={out.intent} · safety={out.safety_level} · mood={out.mood} · memory={needs_memory} · web={out.needs_web_search}",
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
        chips.append({"type": "progress", "text": f"✅ {label} · {sign}{r['delta']}%"})
    db.commit()
    today = goal_svc.user_today(user)
    refreshed = [
        goal_svc.goal_to_dict(g, today, detailed=True)
        for g in goal_svc.load_goals(db, user.id)
        if goal_svc.visible_to(g, state["character"].id)
    ]
    return {"progress_results": results, "goals_view": refreshed, "chips": chips, "_note": f"{len(results)} updates applied"}


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


@traced("responder", "Writing reply")
def responder(state: ChatState, ctx: TurnContext) -> dict:
    c: Character = state["character"]
    user: User = state["user"]
    bond: CharacterBond = state["bond"]
    life = state.get("life_event")
    prompt_ctx = {
        "character": {
            "name": c.name, "age": c.age, "occupation": c.occupation, "city": c.city, "personality": c.personality,
            "speaking_style": c.speaking_style, "motivation_style": c.motivation_style, "backstory": c.backstory,
            "worldview": c.worldview, "family_friends": c.family_friends, "interests": c.interests,
        },
        "user_name": user.name.split()[0],
        "others": state.get("others", []),
        "notes": state.get("notes", []),
        "adaptations": state.get("adaptations", []),
        "life_event": {"title": life.title, "description": life.description} if life else None,
        "patterns": user.patterns,
        "bond_level": bond.bond_level,
        "bond_messages": bond.messages_count,
        "mood": state.get("mood", "neutral"),
        "mood_intensity": state.get("mood_intensity", 5),
        "memories": state.get("memories", []),
        "goals_view": state.get("goals_view", []),
        "focus_id": state.get("focus_id"),
        "situation": prompts.situation_for(state),
        "now_str": state["now_str"],
    }
    messages = [SystemMessage(prompts.responder_system(prompt_ctx))]
    for m in state["history"]:
        messages.append(HumanMessage(m["content"]) if m["role"] == "user" else AIMessage(m["content"]))
    messages.append(HumanMessage(state["user_message"]))

    try:
        text = llm.stream("reply", messages, lambda t: ctx.emit("token", {"text": t}), ctx.usage)
    except llm.LLMUnavailable:
        text = "Ugh, my network just dropped for a sec 😅 Can you send that again?"
        ctx.emit("token", {"text": text})
    return {"response": text.strip(), "_note": f"{len(text)} chars · {len(messages)} messages in prompt"}


@traced("post_process", "Saving turn")
def post_process(state: ChatState, ctx: TurnContext) -> dict:
    db = ctx.db
    session: ChatSession = state["session"]
    bond: CharacterBond = state["bond"]
    cards = []
    if state.get("created_goal"):
        cards.append({"type": "goal", "goal": state["created_goal"], "validation": state.get("validation")})
    elif state.get("validation") and state["validation"]["tier"] == "refuse":
        cards.append({"type": "refused", "validation": state["validation"]})
    msg = Message(
        session_id=session.id,
        role="assistant",
        content=state.get("response", ""),
        meta={
            "character_id": state["character"].id,
            "chips": state.get("chips", []),
            "cards": cards,
            "sources": state.get("search_results", [])[:5],
            "progress": state.get("progress_results", []),
            "intent": state.get("intent"),
            "mood": state.get("mood"),
        },
    )
    db.add(msg)
    if state.get("mood"):
        db.add(MoodLog(user_id=state["user_id"], character_id=state["character"].id, mood=state["mood"],
                       intensity=state.get("mood_intensity", 5)))
    bond.messages_count += 1
    bond.last_chat_at = datetime.now(timezone.utc)
    bond.bond_level = "close" if bond.messages_count >= 60 else "friend" if bond.messages_count >= 16 else "new"
    if state.get("life_event") is not None:
        state["life_event"].was_shared = True
    session.updated_at = datetime.now(timezone.utc)
    if session.title == "New chat":
        session.title = state["user_message"][:48] + ("…" if len(state["user_message"]) > 48 else "")
    db.commit()
    return {"assistant_message_id": msg.id, "_note": f"message #{msg.id} saved · bond={bond.bond_level}"}


# ─────────────────────────── Routing ───────────────────────────

TOOL_NODES = ["progress_update", "goal_validator", "web_search", "goal_planner", "memory_retrieval", "responder"]


def next_step(state: ChatState) -> str:
    visited = set(state.get("route", []))
    if state.get("safety_level") in ("harmful", "self_harm"):
        return "responder"
    if state.get("progress_updates") and "progress_update" not in visited:
        return "progress_update"
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
        ("progress_update", progress_update), ("goal_validator", goal_validator), ("web_search", web_search),
        ("goal_planner", goal_planner), ("memory_retrieval", memory_retrieval), ("responder", responder),
        ("post_process", post_process),
    ]:
        g.add_node(name, fn)
    g.set_entry_point("load_context")
    g.add_edge("load_context", "classify")
    g.add_edge("classify", "safety_guard")
    path_map = {n: n for n in TOOL_NODES}
    for node in ["safety_guard", "progress_update", "goal_validator", "web_search", "goal_planner", "memory_retrieval"]:
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
            ["progress_update", "responder"],
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
