"""Weekly insight report.

All numbers are computed deterministically from the user's own data (todo logs, moods, promises, memories).
The LLM only writes the narrative on top of those numbers — it never invents statistics.
"""
from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents import llm
from app.agents.schemas import WeeklyNarrative
from app.db.models import (
    Character,
    ChatSession,
    Commitment,
    Episode,
    Fact,
    Message,
    MoodLog,
    User,
    WeeklyReport,
)
from app.services import goals as goal_svc

MOOD_SCORE = {
    "happy": 9, "excited": 9, "joyful": 9, "grateful": 8, "proud": 8, "motivated": 8, "determined": 8, "calm": 7,
    "content": 7, "relaxed": 7, "hopeful": 7, "curious": 6, "neutral": 5, "okay": 5, "mixed": 5, "bored": 4,
    "confused": 4, "tired": 3, "guilty": 3, "stressed": 2, "anxious": 2, "frustrated": 2, "sad": 2, "overwhelmed": 2,
    "lonely": 2, "angry": 1,
}
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _mood_score(mood: str) -> int:
    return MOOD_SCORE.get((mood or "").lower(), 5)


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 4:
        return None
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if sx == 0 or sy == 0:
        return None
    return round(sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy), 2)


def compute_stats(db: Session, user: User, end: date) -> dict:
    start = end - timedelta(days=6)
    prev_start, prev_end = start - timedelta(days=7), start - timedelta(days=1)
    goals = goal_svc.load_goals(db, user.id, status=None)
    active = [g for g in goals if g.status == "active"]

    # ── Daily completion (done vs planned daily habits) ──
    done_by_day: dict[date, int] = defaultdict(int)
    for g in goals:
        for t in g.todos:
            for log in t.logs:
                done_by_day[log.day] += 1

    def planned_on(day: date) -> int:
        return sum(1 for g in goals for t in g.todos if t.recurrence == "daily" and g.created_at.date() <= day)

    days = []
    for i in range(7):
        d = start + timedelta(days=i)
        planned = planned_on(d)
        done = done_by_day.get(d, 0)
        days.append({"day": d.isoformat(), "label": WEEKDAYS[d.weekday()], "done": done, "planned": planned,
                     # today is still in progress: no rate, so it can't be judged as a bad day
                     "rate": round(min(1.0, done / planned), 2) if planned and d != end else None, "partial": d == end})

    def rate(a: date, b: date) -> float | None:
        b = min(b, end - timedelta(days=1))  # today is still in progress — only count finished days
        planned = sum(planned_on(a + timedelta(days=i)) for i in range((b - a).days + 1))
        done = sum(done_by_day.get(a + timedelta(days=i), 0) for i in range((b - a).days + 1))
        return round(min(1.0, done / planned), 3) if planned else None

    this_rate, prev_rate = rate(start, end), rate(prev_start, prev_end)

    # ── Best weekday over the last 4 weeks ──
    by_weekday: dict[int, list[float]] = defaultdict(list)
    for i in range(1, 29):
        d = end - timedelta(days=i)
        p = planned_on(d)
        if p:
            by_weekday[d.weekday()].append(min(1.0, done_by_day.get(d, 0) / p))
    best_weekday = max(by_weekday, key=lambda k: sum(by_weekday[k]) / len(by_weekday[k]), default=None)

    # ── Mood ↔ habits ──
    moods = db.scalars(select(MoodLog).where(
        MoodLog.user_id == user.id,
        MoodLog.created_at >= datetime.combine(end - timedelta(days=27), datetime.min.time(), tzinfo=timezone.utc),
    )).all()
    mood_by_day: dict[date, list[int]] = defaultdict(list)
    for m in moods:
        mood_by_day[m.created_at.date()].append(_mood_score(m.mood))
    paired = [(sum(v) / len(v), done_by_day.get(d, 0)) for d, v in mood_by_day.items()]
    good = [done for mood, done in paired if mood >= 6]
    low = [done for mood, done in paired if mood <= 4]
    week_moods = [m for m in moods if start <= m.created_at.date() <= end]
    mood_counts = Counter(m.mood for m in week_moods)

    # ── Promises ──
    promises = db.scalars(select(Commitment).where(
        Commitment.user_id == user.id, Commitment.due_date >= start, Commitment.due_date <= end)).all()
    kept = sum(1 for p in promises if p.status == "kept")
    broken = sum(1 for p in promises if p.status == "broken")

    # ── Goals ──
    goal_rows = []
    for g in active:
        week_done = sum(1 for t in g.todos for log in t.logs if start <= log.day <= end)
        week_planned = sum(7 if t.recurrence == "daily" else 1 for t in g.todos)
        goal_rows.append({"id": g.id, "title": g.title, "category": g.category, "progress": g.progress,
                          "streak": g.streak_current, "week_done": week_done, "week_planned": week_planned,
                          "week_rate": round(min(1.0, week_done / week_planned), 2) if week_planned else 0})

    # ── Memories & conversations ──
    since = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
    episodes = db.scalars(select(Episode).where(Episode.user_id == user.id, Episode.occurred_at >= since)).all()
    themes = Counter(k.lower() for e in episodes for k in (e.keywords or []))
    new_facts = db.scalar(select(func.count(Fact.id)).where(Fact.user_id == user.id, Fact.created_at >= since)) or 0
    chat_rows = db.execute(
        select(Character.name, func.count(Message.id))
        .select_from(Message).join(ChatSession, Message.session_id == ChatSession.id)
        .join(Character, Character.id == ChatSession.character_id, isouter=True)
        .where(ChatSession.user_id == user.id, Message.role == "user", Message.created_at >= since)
        .group_by(Character.name)
    ).all()

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "completion": {"this_week": this_rate, "last_week": prev_rate,
                       "change": round(this_rate - prev_rate, 3) if this_rate is not None and prev_rate is not None else None},
        "days": days,
        "best_weekday": WEEKDAYS[best_weekday] if best_weekday is not None else None,
        "streaks": {"best_current": max((g.streak_current for g in active), default=0),
                    "best_ever": max((g.streak_best for g in goals), default=0)},
        "mood": {
            "average": round(sum(_mood_score(m.mood) for m in week_moods) / len(week_moods), 1) if week_moods else None,
            "top": mood_counts.most_common(3),
            "todos_on_good_days": round(sum(good) / len(good), 1) if good else None,
            "todos_on_low_days": round(sum(low) / len(low), 1) if low else None,
            "correlation": _pearson([m for m, _ in paired], [float(d) for _, d in paired]),
            "days_with_mood": len(paired),
        },
        "promises": {"total": len(promises), "kept": kept, "broken": broken,
                     "pending": len(promises) - kept - broken,
                     "kept_rate": round(kept / (kept + broken), 2) if kept + broken else None,
                     "items": [{"text": p.text, "status": p.status, "due": p.due_date.isoformat()} for p in promises]},
        "goals": goal_rows,
        "memory": {"episodes": len(episodes), "new_facts": new_facts, "themes": themes.most_common(8)},
        "conversations": [{"character": name or "Crew (group)", "messages": n} for name, n in chat_rows],
    }


def build_report(db: Session, user: User, refresh: bool = False) -> WeeklyReport:
    end = goal_svc.user_today(user)
    report = db.scalar(select(WeeklyReport).where(WeeklyReport.user_id == user.id, WeeklyReport.period_end == end))
    fresh = report and datetime.now(timezone.utc) - report.created_at < timedelta(hours=3)
    if report and fresh and not refresh:
        return report
    stats = compute_stats(db, user, end)
    crew = db.scalars(select(Character).where(Character.is_preset.is_(True)).order_by(Character.id)).all()
    crew_desc = "\n".join(f"- {c.name}: {c.personality[:160]} Style: {c.speaking_style[:120]}" for c in crew)
    try:
        narrative = llm.structured("plan", WeeklyNarrative, [
            SystemMessage(
                "You write a weekly lifestyle & goals report for the user of a companion app. Use ONLY the numbers in "
                "the JSON; never invent data. Rates are fractions (0.8 = 80%). The last day (partial=true) is TODAY and still in "
                "progress — never call it a struggle. Be warm, specific and honest. "
                f"Then add one short comment from each crew member in their own voice:\n{crew_desc}"
            ),
            HumanMessage(f"User: {user.name.split()[0]}\nWeek stats JSON:\n{json.dumps(stats, default=str)}"),
        ]).model_dump()
    except llm.LLMUnavailable:
        narrative = {"headline": "Your week in numbers", "summary": "", "wins": [], "struggles": [],
                     "focus_next_week": "", "crew": []}
    if report is None:
        report = WeeklyReport(user_id=user.id, period_start=end - timedelta(days=6), period_end=end)
        db.add(report)
    report.stats, report.narrative, report.created_at = stats, narrative, datetime.now(timezone.utc)
    db.commit()
    return report
