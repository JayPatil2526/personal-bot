from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    timezone: str = "Asia/Kolkata"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class CharacterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    avatar: str = "🙂"
    color: str = "violet"
    tagline: str = ""
    age: int = Field(28, ge=18, le=90)
    city: str = ""
    occupation: str = ""
    personality: str = ""
    speaking_style: str = ""
    motivation_style: str = ""
    backstory: str = ""
    worldview: str = ""
    family_friends: list[dict] = []
    interests: list[str] = []


class CharacterDraftIn(BaseModel):
    name: str
    vibe: str = Field(description="Free text: what kind of companion the user wants")


class SessionIn(BaseModel):
    character_id: int


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class GoalPreviewIn(BaseModel):
    title: str = Field(min_length=2, max_length=300)
    description: str = ""
    priority: Literal["low", "medium", "high", "urgent"] | None = None
    deadline: date | None = None


class PlanTodoIn(BaseModel):
    title: str
    recurrence: Literal["daily", "weekly", "once"] = "daily"
    time_hint: str = ""


class GoalCreateIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = ""
    category: str = "lifestyle"
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    deadline: date | None = None
    milestones: list[str] = []
    todos: list[PlanTodoIn] = []
    visibility: list[int] | Literal["all"] = "all"
    feasibility: float = 1.0
    safety_tier: Literal["safe", "reframed"] = "safe"
    validation_note: str = ""
    original_request: str = ""
    sources: list[dict] = []


class GoalPatchIn(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: Literal["low", "medium", "high", "urgent"] | None = None
    deadline: date | None = None
    status: Literal["active", "completed", "paused"] | None = None
    visibility: list[int] | Literal["all"] | None = None


class ToggleIn(BaseModel):
    done: bool = True
