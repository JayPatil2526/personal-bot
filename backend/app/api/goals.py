from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents import llm
from app.agents.goal_agent import preview_goal
from app.agents.schemas import Nudge
from app.api.characters import _accessible
from app.api.schemas import GoalCreateIn, GoalPatchIn, GoalPreviewIn, ToggleIn
from app.core.security import get_current_user
from app.db.models import AgentTrace, Character, Episode, Fact, Goal, Milestone, MoodLog, ProgressLog, Todo, User
from app.db.session import get_db
from app.services import goals as goal_svc

router = APIRouter(tags=["goals"])


def _own_goal(db: Session, user: User, goal_id: int) -> Goal:
    g = db.get(Goal, goal_id)
    if not g or g.user_id != user.id:
        raise HTTPException(404, "Goal not found")
    return g


@router.get("/goals")
def list_goals(status: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = goal_svc.user_today(user)
    goals = goal_svc.load_goals(db, user.id, status=status)
    return [goal_svc.goal_to_dict(g, today, detailed=True) for g in goals]


@router.post("/goals/preview")
def goal_preview(body: GoalPreviewIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Run validator (+ web search) + planner without saving, so the wizard can show the plan first."""
    today = goal_svc.user_today(user)
    request = body.title + (f". {body.description}" if body.description else "")
    if body.deadline:
        request += f" (deadline {body.deadline.isoformat()})"
    usage = llm.Usage()
    existing = [g.title for g in goal_svc.load_goals(db, user.id)]
    try:
        result = preview_goal(request, today, existing, usage)
    except llm.LLMUnavailable as exc:
        raise HTTPException(503, f"AI is unavailable right now: {exc}")
    v = result["validation"]
    if body.priority:
        v["suggested_priority"] = body.priority
    result["deadline"] = (body.deadline or today + timedelta(days=v["suggested_deadline_days"])).isoformat()
    db.add(AgentTrace(user_id=user.id, kind="goal_preview", user_message=request, nodes=result["steps"],
                      route=[s["node"] for s in result["steps"]], total_ms=round(sum(s["ms"] for s in result["steps"]), 1),
                      input_tokens=usage.input_tokens, output_tokens=usage.output_tokens, providers=usage.providers))
    db.commit()
    return result


@router.post("/goals")
def create_goal(body: GoalCreateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = body.model_dump()
    data["todos"] = [t for t in data["todos"] if t["title"].strip()]
    goal = goal_svc.create_goal(db, user, **data, created_via="form")
    db.commit()
    return goal_svc.goal_to_dict(goal, goal_svc.user_today(user), detailed=True)


@router.get("/goals/{goal_id}")
def get_goal(goal_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = _own_goal(db, user, goal_id)
    data = goal_svc.goal_to_dict(goal, goal_svc.user_today(user), detailed=True)
    logs = db.scalars(select(ProgressLog).where(ProgressLog.goal_id == goal.id).order_by(ProgressLog.created_at)).all()
    data["progress_history"] = [{"at": l.created_at.isoformat(), "progress": l.new_progress, "delta": l.delta,
                                 "source": l.source, "note": l.note} for l in logs]
    data["done_days"] = sorted(d.isoformat() for d in goal_svc.done_days(goal))
    return data


@router.patch("/goals/{goal_id}")
def patch_goal(goal_id: int, body: GoalPatchIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = _own_goal(db, user, goal_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(goal, k, v)
    db.commit()
    return goal_svc.goal_to_dict(goal, goal_svc.user_today(user), detailed=True)


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own_goal(db, user, goal_id))
    db.commit()
    return {"ok": True}


@router.get("/todos/today")
def todos_today(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return goal_svc.todays_todos(goal_svc.load_goals(db, user.id), goal_svc.user_today(user))


@router.post("/todos/{todo_id}/toggle")
def toggle_todo(todo_id: int, body: ToggleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    todo = db.get(Todo, todo_id)
    if not todo or todo.user_id != user.id:
        raise HTTPException(404, "Todo not found")
    result = goal_svc.set_todo_done(db, user, todo, body.done)
    db.commit()
    return result


@router.post("/milestones/{milestone_id}/toggle")
def toggle_milestone(milestone_id: int, body: ToggleIn, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    ms = db.get(Milestone, milestone_id)
    if not ms or ms.goal.user_id != user.id:
        raise HTTPException(404, "Milestone not found")
    result = goal_svc.set_milestone_done(db, user, ms, body.done)
    db.commit()
    return result


@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = goal_svc.user_today(user)
    goals = goal_svc.load_goals(db, user.id, status=None)
    active = [g for g in goals if g.status == "active"]
    todos = goal_svc.todays_todos(active, today)
    focus = goal_svc.focus_goal(active, today)
    since = datetime.now(timezone.utc) - timedelta(days=14)

    moods = db.scalars(select(MoodLog).where(MoodLog.user_id == user.id, MoodLog.created_at >= since)
                       .order_by(MoodLog.created_at)).all()
    # Daily todo completions over the last 14 days (activity chart)
    per_day: dict[str, int] = defaultdict(int)
    for g in goals:
        for t in g.todos:
            for log in t.logs:
                if log.day >= today - timedelta(days=13):
                    per_day[log.day.isoformat()] += 1
    activity = [{"day": (today - timedelta(days=i)).isoformat(),
                 "done": per_day.get((today - timedelta(days=i)).isoformat(), 0)} for i in range(13, -1, -1)]

    episodes = db.scalars(select(Episode).where(Episode.user_id == user.id).order_by(Episode.occurred_at.desc()).limit(5)).all()
    return {
        "user": {"name": user.name, "patterns": user.patterns or {}},
        "today": today.isoformat(),
        "stats": {
            "active_goals": len(active),
            "completed_goals": sum(1 for g in goals if g.status == "completed"),
            "todos_done_today": sum(1 for t in todos if t["done_today"]),
            "todos_total_today": len(todos),
            "best_streak": max((g.streak_best for g in goals), default=0),
            "current_streak": max((goal_svc.compute_streak(g, today) for g in active), default=0),
            "memories": (db.scalar(select(func.count(Episode.id)).where(Episode.user_id == user.id)) or 0)
            + (db.scalar(select(func.count(Fact.id)).where(Fact.user_id == user.id)) or 0),
        },
        "focus_goal": goal_svc.goal_to_dict(focus, today, detailed=True) if focus else None,
        "goals": sorted([goal_svc.goal_to_dict(g, today) for g in active], key=lambda g: -g["weight"]),
        "todos": todos,
        "activity": activity,
        "moods": [{"at": m.created_at.isoformat(), "mood": m.mood, "intensity": m.intensity} for m in moods],
        "recent_memories": [{"id": e.id, "summary": e.summary, "emotion": e.emotion, "when": e.occurred_at.isoformat(),
                             "kind": e.kind} for e in episodes],
    }


@router.get("/dashboard/nudge")
def nudge(character_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """A short proactive, in-character nudge about the focus goal."""
    if character_id:
        character = _accessible(db, user, character_id)
    else:
        character = db.scalar(select(Character).where(Character.is_preset.is_(True)).order_by(func.random()))
    today = goal_svc.user_today(user)
    active = goal_svc.load_goals(db, user.id)
    focus = goal_svc.focus_goal(active, today, character.id)
    pending = [t for t in goal_svc.todays_todos(active, today) if not t["done_today"]]
    situation = (
        f"Focus goal: {focus.title} ({focus.progress:.0f}% done, streak {focus.streak_current} days). "
        f"Pending today: {', '.join(t['title'] for t in pending[:3]) or 'nothing — all done!'}"
        if focus else "The user has no goals yet. Invite them to set one."
    )
    try:
        out = llm.structured("nudge", Nudge, [
            SystemMessage(f"You are {character.name}. Personality: {character.personality}. Style: {character.speaking_style}. "
                          f"Motivation style: {character.motivation_style}. Write a short proactive check-in message "
                          f"to {user.name.split()[0]} (they just opened the app)."),
            HumanMessage(situation),
        ])
        message = out.message
    except llm.LLMUnavailable:
        message = f"Hey {user.name.split()[0]}! Ready to crush today's goals?"
    return {"character": {"id": character.id, "name": character.name, "avatar": character.avatar, "color": character.color},
            "message": message}
