"""Goal engine: plans, todos, progress, streaks and priority weighting."""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Goal, Milestone, ProgressLog, Todo, TodoLog, User

PRIORITY_BASE = {"low": 1.0, "medium": 2.0, "high": 3.0, "urgent": 4.0}
DEFAULT_DURATION_DAYS = 30


def user_today(user: User) -> date:
    try:
        return datetime.now(ZoneInfo(user.timezone or "Asia/Kolkata")).date()
    except Exception:  # noqa: BLE001
        return datetime.now(timezone.utc).date()


def visible_to(goal: Goal, character_id: int | None) -> bool:
    if goal.visibility == "all" or character_id is None:
        return True
    return isinstance(goal.visibility, list) and character_id in goal.visibility


def load_goals(db: Session, user_id: int, status: str | None = "active") -> list[Goal]:
    q = (
        select(Goal)
        .options(selectinload(Goal.milestones), selectinload(Goal.todos).selectinload(Todo.logs))
        .where(Goal.user_id == user_id)
        .order_by(Goal.created_at.desc())
    )
    if status:
        q = q.where(Goal.status == status)
    return list(db.scalars(q).all())


# ─────────────────────────── Progress & streaks ───────────────────────────


def _duration_days(goal: Goal) -> int:
    start = goal.created_at.date()
    if goal.deadline and goal.deadline > start:
        return (goal.deadline - start).days + 1
    return DEFAULT_DURATION_DAYS


def expected_completions(goal: Goal) -> int:
    days = _duration_days(goal)
    total = 0
    for t in goal.todos:
        if t.recurrence == "daily":
            total += days
        elif t.recurrence == "weekly":
            total += math.ceil(days / 7)
        else:
            total += 1
    return max(total, 1)


def compute_progress(goal: Goal) -> float:
    completions = sum(len(t.logs) for t in goal.todos)
    todo_ratio = min(1.0, completions / expected_completions(goal)) if goal.todos else 0.0
    if goal.milestones:
        ms_ratio = sum(1 for m in goal.milestones if m.done) / len(goal.milestones)
        value = 0.5 * todo_ratio + 0.5 * ms_ratio if goal.todos else ms_ratio
    else:
        value = todo_ratio
    return round(100 * value, 1)


def done_days(goal: Goal) -> set[date]:
    return {log.day for t in goal.todos for log in t.logs}


def compute_streak(goal: Goal, today: date) -> int:
    days = done_days(goal)
    cursor = today if today in days else today - timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def refresh_goal(db: Session, goal: Goal, today: date, source: str, note: str = "") -> float:
    """Recompute progress + streak, persist a progress log entry. Returns the progress delta."""
    old = goal.progress or 0.0
    new = compute_progress(goal)
    goal.progress = new
    goal.streak_current = compute_streak(goal, today)
    goal.streak_best = max(goal.streak_best or 0, goal.streak_current)
    days = done_days(goal)
    goal.last_done_date = max(days) if days else None
    if new >= 100 and goal.status == "active":
        goal.status = "completed"
    delta = round(new - old, 1)
    if delta != 0:
        db.add(ProgressLog(goal_id=goal.id, delta=delta, new_progress=new, source=source, note=note[:500]))
    return delta


def priority_weight(goal: Goal, today: date) -> float:
    """weight = priority_base × deadline_factor × (1 + 0.2 × missed_days)."""
    base = PRIORITY_BASE.get(goal.priority, 2.0)
    deadline_factor = 1.0
    if goal.deadline:
        days_left = (goal.deadline - today).days
        if days_left <= 3:
            deadline_factor = 1.5
        elif days_left <= 7:
            deadline_factor = 1.2
    missed = 0
    if any(t.recurrence == "daily" for t in goal.todos):
        reference = goal.last_done_date or goal.created_at.date()
        missed = min(5, max(0, (today - reference).days - (0 if goal.last_done_date is None else 1)))
    return round(base * deadline_factor * (1 + 0.2 * missed), 2)


# ─────────────────────────── Todos ───────────────────────────


def _done_on(todo: Todo, day: date) -> bool:
    return any(log.day == day for log in todo.logs)


def _is_due(todo: Todo, today: date) -> bool:
    if todo.recurrence == "daily":
        return True
    if todo.recurrence == "weekly":
        week = today.isocalendar()[:2]
        return not any(log.day.isocalendar()[:2] == week and log.day != today for log in todo.logs)
    return not todo.logs or _done_on(todo, today)


def todo_to_dict(todo: Todo, today: date) -> dict:
    return {
        "id": todo.id,
        "title": todo.title,
        "recurrence": todo.recurrence,
        "time_hint": todo.time_hint,
        "goal_id": todo.goal_id,
        "done_today": _done_on(todo, today),
        "total_done": len(todo.logs),
    }


def todays_todos(goals: list[Goal], today: date) -> list[dict]:
    items = []
    for g in goals:
        if g.status != "active":
            continue
        for t in g.todos:
            if _is_due(t, today):
                items.append({**todo_to_dict(t, today), "goal_title": g.title, "goal_priority": g.priority, "goal_category": g.category})
    items.sort(key=lambda i: (i["done_today"], -PRIORITY_BASE.get(i["goal_priority"], 2)))
    return items


def set_todo_done(db: Session, user: User, todo: Todo, done: bool, source: str = "manual", day: date | None = None) -> dict:
    day = day or user_today(user)
    existing = next((log for log in todo.logs if log.day == day), None)
    if done and existing is None:
        todo.logs.append(TodoLog(day=day, source=source))
    elif not done and existing is not None:
        todo.logs.remove(existing)
        db.delete(existing)
    db.flush()
    goal = todo.goal
    delta = refresh_goal(db, goal, day, "todo" if source == "manual" else "chat", f"{'Completed' if done else 'Undid'}: {todo.title}")
    return {"todo_id": todo.id, "done": done, "goal_id": goal.id, "progress": goal.progress, "delta": delta,
            "streak": goal.streak_current, "goal_status": goal.status}


def set_milestone_done(db: Session, user: User, milestone: Milestone, done: bool, source: str = "manual") -> dict:
    milestone.done = done
    milestone.done_at = datetime.now(timezone.utc) if done else None
    db.flush()
    goal = milestone.goal
    delta = refresh_goal(db, goal, user_today(user), "milestone" if source == "manual" else "chat", f"Milestone: {milestone.title}")
    return {"milestone_id": milestone.id, "done": done, "goal_id": goal.id, "progress": goal.progress, "delta": delta,
            "goal_status": goal.status}


# ─────────────────────────── Create & serialise ───────────────────────────


def create_goal(
    db: Session,
    user: User,
    *,
    title: str,
    description: str = "",
    category: str = "lifestyle",
    priority: str = "medium",
    deadline: date | None = None,
    milestones: list[str] | None = None,
    todos: list[dict] | None = None,
    feasibility: float = 1.0,
    safety_tier: str = "safe",
    validation_note: str = "",
    original_request: str = "",
    visibility: list[int] | str = "all",
    created_via: str = "form",
    created_by_character_id: int | None = None,
    sources: list[dict] | None = None,
) -> Goal:
    goal = Goal(
        user_id=user.id,
        title=title[:200],
        description=description,
        category=category,
        priority=priority if priority in PRIORITY_BASE else "medium",
        deadline=deadline,
        feasibility=feasibility,
        safety_tier=safety_tier,
        validation_note=validation_note,
        original_request=original_request,
        visibility=visibility or "all",
        created_via=created_via,
        created_by_character_id=created_by_character_id,
        sources=sources or [],
    )
    for i, m in enumerate(milestones or []):
        goal.milestones.append(Milestone(title=m[:200], order=i))
    for t in todos or []:
        rec = t.get("recurrence", "daily")
        goal.todos.append(
            Todo(user_id=user.id, title=t["title"][:200], recurrence=rec if rec in ("daily", "weekly", "once") else "daily",
                 time_hint=t.get("time_hint", "")[:40])
        )
    db.add(goal)
    db.flush()
    db.add(ProgressLog(goal_id=goal.id, delta=0, new_progress=0, source="manual", note="Goal created"))
    return goal


def goal_to_dict(goal: Goal, today: date, detailed: bool = False) -> dict:
    due = [t for t in goal.todos if _is_due(t, today)]
    done_today = sum(1 for t in due if _done_on(t, today))
    data = {
        "id": goal.id,
        "title": goal.title,
        "description": goal.description,
        "category": goal.category,
        "priority": goal.priority,
        "deadline": goal.deadline.isoformat() if goal.deadline else None,
        "days_left": (goal.deadline - today).days if goal.deadline else None,
        "status": goal.status,
        "progress": goal.progress,
        "today_done": done_today,
        "today_total": len(due),
        "streak_current": goal.streak_current,
        "streak_best": goal.streak_best,
        "weight": priority_weight(goal, today),
        "feasibility": goal.feasibility,
        "safety_tier": goal.safety_tier,
        "validation_note": goal.validation_note,
        "visibility": goal.visibility,
        "created_via": goal.created_via,
        "created_at": goal.created_at.isoformat(),
        "milestones_done": sum(1 for m in goal.milestones if m.done),
        "milestones_total": len(goal.milestones),
    }
    if detailed:
        data["milestones"] = [{"id": m.id, "title": m.title, "done": m.done} for m in goal.milestones]
        data["todos"] = [todo_to_dict(t, today) for t in goal.todos]
        data["sources"] = goal.sources
        data["original_request"] = goal.original_request
    return data


def focus_goal(goals: list[Goal], today: date, character_id: int | None = None) -> Goal | None:
    active = [g for g in goals if g.status == "active" and visible_to(g, character_id)]
    return max(active, key=lambda g: priority_weight(g, today), default=None)
