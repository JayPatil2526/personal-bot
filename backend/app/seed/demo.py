"""Create a demo account with ~2 weeks of goal/habit history so the dashboard charts have data.

    python -m app.seed.demo            # creates demo@lifecrew.app / demo1234 (re-creates if it exists)

Only goals, todo completions, mood logs and a few resolved promises are backfilled. Memories (episodes/facts) are NOT
fabricated here — they are created live by the agent when you chat during the demo.
"""
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.core.security import hash_password
from app.db.init_db import init_db
from app.db.models import Character, Commitment, MoodLog, ProgressLog, TodoLog, User
from app.db.session import SessionLocal
from app.services import goals as goal_svc

EMAIL = "demo@lifecrew.app"
PASSWORD = "demo1234"

GOALS = [
    {
        "title": "Drink 2.5 litres of water daily",
        "description": "Stay hydrated to beat the afternoon slump at work.",
        "category": "health",
        "priority": "high",
        "days": 30,
        "milestones": ["Hit 2L on 5 days", "Hit 2.5L for a full week", "Make it automatic for 3 weeks"],
        "todos": [
            {"title": "Glass of water after waking up", "recurrence": "daily", "time_hint": "morning"},
            {"title": "Refill desk bottle twice", "recurrence": "daily", "time_hint": "afternoon"},
            {"title": "One glass before dinner", "recurrence": "daily", "time_hint": "evening"},
        ],
        "hit_rate": 0.8,
        "milestones_done": 1,
        "coach": "Arjun",
    },
    {
        "title": "Build a calm morning routine",
        "description": "Start the day slow: stretch, journal, no phone for 20 minutes.",
        "category": "mindfulness",
        "priority": "medium",
        "days": 21,
        "milestones": ["5 phone-free mornings", "Journal 10 times", "Routine feels natural"],
        "todos": [
            {"title": "10 min stretching", "recurrence": "daily", "time_hint": "morning"},
            {"title": "Write 3 lines in journal", "recurrence": "daily", "time_hint": "morning"},
        ],
        "hit_rate": 0.6,
        "milestones_done": 1,
        "coach": "Meera",
    },
    {
        "title": "Start a monthly SIP and learn index investing",
        "description": "Long-term wealth instead of get-rich-quick schemes.",
        "category": "finance",
        "priority": "medium",
        "days": 60,
        "milestones": ["Understand SIPs & index funds", "Open an investment account", "Start first ₹2,000 SIP", "Review after 3 months"],
        "todos": [
            {"title": "Read one article on index funds", "recurrence": "weekly", "time_hint": "anytime"},
            {"title": "Compare 3 index funds' expense ratios", "recurrence": "once", "time_hint": "anytime"},
        ],
        "hit_rate": 0.5,
        "milestones_done": 1,
        "coach": "Kabir",
    },
]

MOODS = ["tired", "stressed", "neutral", "okay", "motivated", "calm", "happy", "proud", "motivated", "happy"]


def main() -> None:
    init_db()
    random.seed(7)
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.email == EMAIL))
        if existing:
            db.delete(existing)
            db.commit()
        user = User(email=EMAIL, name="Jay Patil", password_hash=hash_password(PASSWORD), timezone="Asia/Kolkata")
        db.add(user)
        db.flush()
        chars = {c.name: c for c in db.scalars(select(Character).where(Character.is_preset.is_(True))).all()}
        today = goal_svc.user_today(user)
        start = today - timedelta(days=13)

        for spec in GOALS:
            goal = goal_svc.create_goal(
                db, user, title=spec["title"], description=spec["description"], category=spec["category"],
                priority=spec["priority"], deadline=start + timedelta(days=spec["days"]), milestones=spec["milestones"],
                todos=spec["todos"], created_via="chat", created_by_character_id=chars[spec["coach"]].id,
                validation_note="Safe and realistic habit goal.",
            )
            goal.created_at = datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)
            db.execute(delete(ProgressLog).where(ProgressLog.goal_id == goal.id))
            db.add(ProgressLog(goal_id=goal.id, delta=0, new_progress=0, source="manual", note="Goal created",
                               created_at=goal.created_at))
            for m in goal.milestones[: spec["milestones_done"]]:
                m.done = True
                m.done_at = goal.created_at + timedelta(days=6)
            db.flush()
            # Backfill completions for past days only (today is left for the live demo)
            for offset in range(13):
                day = start + timedelta(days=offset)
                for todo in goal.todos:
                    if todo.recurrence == "daily" and random.random() < spec["hit_rate"] + offset * 0.01:
                        todo.logs.append(TodoLog(day=day, source="manual"))
                    elif todo.recurrence == "weekly" and offset in (2, 9):
                        todo.logs.append(TodoLog(day=day, source="manual"))
                db.flush()
                goal.progress = goal_svc.compute_progress(goal)
                db.add(ProgressLog(goal_id=goal.id, delta=0, new_progress=goal.progress, source="todo",
                                   note=f"Day {offset + 1}", created_at=datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=20)))
            goal_svc.refresh_goal(db, goal, today, "manual", "Demo backfill")

        # A few past promises made in chat (kept / missed) so the promise tracker has history
        for text, days_ago, status, coach in [
            ("Go for a 20 min walk after dinner", 9, "kept", "Arjun"),
            ("Sleep before 11:30 pm", 6, "broken", "Meera"),
            ("Read the index-fund article Kabir sent", 4, "kept", "Kabir"),
            ("No phone for the first 20 minutes after waking", 2, "kept", "Meera"),
            ("Finish the 5 km run on Sunday", 1, "broken", "Arjun"),
        ]:
            due = today - timedelta(days=days_ago)
            db.add(Commitment(user_id=user.id, character_id=chars[coach].id, text=text, due_date=due, status=status,
                              created_at=datetime.combine(due - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc),
                              resolved_at=datetime.combine(due, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=21),
                              followed_up_at=datetime.combine(due, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=20)))

        for offset in range(13):
            day = start + timedelta(days=offset)
            for _ in range(random.randint(1, 2)):
                db.add(MoodLog(user_id=user.id, mood=MOODS[min(len(MOODS) - 1, offset // 2 + random.randint(0, 3))],
                               intensity=random.randint(4, 8),
                               created_at=datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=random.randint(8, 21))))
        db.commit()
        print(f"Demo account ready: {EMAIL} / {PASSWORD}")


if __name__ == "__main__":
    main()
