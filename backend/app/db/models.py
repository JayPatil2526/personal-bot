from datetime import date, datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.session import Base

EMBED_DIM = settings.embedding_dim


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────── Users & characters ───────────────────────────


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    is_developer: Mapped[bool] = mapped_column(Boolean, default=True)
    # Learned by the behaviour analyzer: active_hours, motivation_style, tone, summary, analyzed_msg_count
    patterns: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(String(80))
    avatar: Mapped[str] = mapped_column(String(16), default="🙂")
    color: Mapped[str] = mapped_column(String(32), default="violet")
    tagline: Mapped[str] = mapped_column(String(200), default="")
    age: Mapped[int] = mapped_column(Integer, default=28)
    city: Mapped[str] = mapped_column(String(80), default="")
    occupation: Mapped[str] = mapped_column(String(120), default="")
    personality: Mapped[str] = mapped_column(Text, default="")
    speaking_style: Mapped[str] = mapped_column(Text, default="")
    motivation_style: Mapped[str] = mapped_column(Text, default="")
    backstory: Mapped[str] = mapped_column(Text, default="")
    worldview: Mapped[str] = mapped_column(Text, default="")
    family_friends: Mapped[list] = mapped_column(JSON, default=list)
    interests: Mapped[list] = mapped_column(JSON, default=list)
    is_preset: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CharacterBond(Base):
    """Relationship level between one user and one character (new → friend → close)."""

    __tablename__ = "character_bonds"
    __table_args__ = (UniqueConstraint("user_id", "character_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"))
    bond_level: Mapped[str] = mapped_column(String(20), default="new")
    messages_count: Mapped[int] = mapped_column(Integer, default=0)
    last_chat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CharacterLifeEvent(Base):
    """Small things happening in a character's own life, shared naturally in chat."""

    __tablename__ = "character_life_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    emotion: Mapped[str] = mapped_column(String(40), default="neutral")
    was_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CharacterAdaptation(Base):
    """A user interest the character has picked up in their own way."""

    __tablename__ = "character_adaptations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"))
    topic: Mapped[str] = mapped_column(String(200))
    twist: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CharacterNote(Base):
    """Cross-character sync: what one character observed, visible to all the user's characters."""

    __tablename__ = "character_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    character: Mapped[Character] = relationship()


# ─────────────────────────── Chat ───────────────────────────


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200), default="New chat")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    character: Mapped[Character] = relationship()
    messages: Mapped[list["Message"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="Message.id"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    # steps, chips, goal cards, sources — whatever the UI needs to re-render the turn
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped[ChatSession] = relationship(back_populates="messages")


# ─────────────────────────── Goals ───────────────────────────


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40), default="lifestyle")
    priority: Mapped[str] = mapped_column(String(16), default="medium")  # low | medium | high | urgent
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | completed | paused
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    feasibility: Mapped[float] = mapped_column(Float, default=1.0)
    safety_tier: Mapped[str] = mapped_column(String(16), default="safe")  # safe | reframed
    validation_note: Mapped[str] = mapped_column(Text, default="")
    original_request: Mapped[str] = mapped_column(Text, default="")
    visibility: Mapped[list | str] = mapped_column(JSON, default="all")  # "all" or [character ids]
    created_via: Mapped[str] = mapped_column(String(16), default="form")  # form | chat
    created_by_character_id: Mapped[int | None] = mapped_column(
        ForeignKey("characters.id", ondelete="SET NULL"), nullable=True
    )
    streak_current: Mapped[int] = mapped_column(Integer, default=0)
    streak_best: Mapped[int] = mapped_column(Integer, default=0)
    last_done_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sources: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", order_by="Milestone.order"
    )
    todos: Mapped[list["Todo"]] = relationship(back_populates="goal", cascade="all, delete-orphan", order_by="Todo.id")


class Milestone(Base):
    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    order: Mapped[int] = mapped_column(Integer, default=0)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    goal: Mapped[Goal] = relationship(back_populates="milestones")


class Todo(Base):
    __tablename__ = "todos"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    recurrence: Mapped[str] = mapped_column(String(16), default="daily")  # daily | weekly | once
    time_hint: Mapped[str] = mapped_column(String(40), default="")  # e.g. "morning"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    goal: Mapped[Goal] = relationship(back_populates="todos")
    logs: Mapped[list["TodoLog"]] = relationship(back_populates="todo", cascade="all, delete-orphan")


class TodoLog(Base):
    """One completion of a todo on a given day (daily todos get one row per day)."""

    __tablename__ = "todo_logs"
    __table_args__ = (UniqueConstraint("todo_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    todo_id: Mapped[int] = mapped_column(ForeignKey("todos.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(16), default="manual")  # manual | chat
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    todo: Mapped[Todo] = relationship(back_populates="logs")


class ProgressLog(Base):
    __tablename__ = "progress_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), index=True)
    delta: Mapped[float] = mapped_column(Float)
    new_progress: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(16))  # todo | chat | milestone | manual
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ─────────────────────────── Memory ───────────────────────────


class Episode(Base):
    """Episodic memory: what happened, when, and how it felt. Shared across the user's characters."""

    __tablename__ = "episodes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    character_id: Mapped[int | None] = mapped_column(ForeignKey("characters.id", ondelete="SET NULL"), nullable=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    emotion: Mapped[str] = mapped_column(String(40), default="neutral")
    importance: Mapped[int] = mapped_column(Integer, default=5)
    kind: Mapped[str] = mapped_column(String(20), default="conversation")  # conversation | reflection
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    embedding = mapped_column(Vector(EMBED_DIM), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    character: Mapped[Character | None] = relationship()

    __table_args__ = (
        Index(
            "ix_episodes_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )


class Fact(Base):
    """Semantic memory: durable facts and preferences about the user."""

    __tablename__ = "facts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    fact: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), default="general")
    kind: Mapped[str] = mapped_column(String(16), default="fact")  # fact | preference
    confidence: Mapped[float] = mapped_column(Float, default=0.8)
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    source_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True
    )
    source_character_id: Mapped[int | None] = mapped_column(
        ForeignKey("characters.id", ondelete="SET NULL"), nullable=True
    )
    embedding = mapped_column(Vector(EMBED_DIM), nullable=True)
    times_updated: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index(
            "ix_facts_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )


class MoodLog(Base):
    __tablename__ = "mood_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    character_id: Mapped[int | None] = mapped_column(ForeignKey("characters.id", ondelete="SET NULL"), nullable=True)
    mood: Mapped[str] = mapped_column(String(40))
    intensity: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ─────────────────────────── Observability ───────────────────────────


class AgentTrace(Base):
    __tablename__ = "agent_traces"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=True)
    message_id: Mapped[int | None] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), default="chat")  # chat | background | goal_preview
    user_message: Mapped[str] = mapped_column(Text, default="")
    nodes: Mapped[list] = mapped_column(JSON, default=list)
    route: Mapped[list] = mapped_column(JSON, default=list)
    retrieved: Mapped[list] = mapped_column(JSON, default=list)
    total_ms: Mapped[float] = mapped_column(Float, default=0.0)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    providers: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
