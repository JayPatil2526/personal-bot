"""Structured outputs for every LLM step in the agent graphs."""
from typing import Literal

from pydantic import BaseModel, Field

Intent = Literal[
    "chit_chat", "new_goal", "progress_report", "goal_question", "ask_info", "memory_question", "emotional"
]
SafetyLevel = Literal["safe", "dual_use", "harmful", "self_harm"]
Category = Literal[
    "health", "fitness", "learning", "finance", "career", "mindfulness", "lifestyle", "productivity", "social", "other"
]
Priority = Literal["low", "medium", "high", "urgent"]


class ProgressUpdate(BaseModel):
    todo_id: int | None = Field(None, description="ID of a todo the user explicitly says they COMPLETED")
    milestone_id: int | None = Field(None, description="ID of a milestone the user explicitly says they reached")
    done: bool = Field(True, description="True = completed. False ONLY to undo a todo already marked done today")
    note: str = Field("", description="Short quote/paraphrase of what the user reported")


class NewPromise(BaseModel):
    text: str = Field(description="What the user committed to, short, second person, e.g. 'Go to the gym'")
    due_in_days: int = Field(0, ge=0, le=30, description="0 = today/tonight, 1 = tomorrow, etc.")


class PromiseUpdate(BaseModel):
    promise_id: int = Field(description="ID from the PENDING PROMISES list")
    kept: bool = Field(description="True if the user says they did it, False if they say they didn't")


class ClassifierOutput(BaseModel):
    intent: Intent = Field(description="Main intent of the latest user message")
    safety_level: SafetyLevel = Field(
        description="safe; dual_use (could be misused but has a legitimate ethical path, e.g. 'learn hacking'); "
        "harmful (weapons, explosives, violence, crime, drugs synthesis, hurting others); self_harm (suicide/self-injury signals)"
    )
    safety_reason: str = Field("", description="One short sentence explaining the safety level")
    goal_request: str = Field(
        "", description="If the user wants to start/set a NEW goal or habit, the goal in their words; otherwise empty"
    )
    progress_updates: list[ProgressUpdate] = Field(
        default_factory=list,
        description="Todos/milestones the user says they COMPLETED in THIS message (use the given IDs). "
        "Skipped / missed / forgot / didn't do → NOT a progress update, leave it out. Empty list if unsure.",
    )
    new_promises: list[NewPromise] = Field(
        default_factory=list,
        description="Concrete commitments the user makes about a FUTURE action ('I will go to the gym tomorrow', "
        "'I'll call mom tonight', 'promise I'll sleep by 11'). Not wishes/goals, not past actions.",
    )
    promise_updates: list[PromiseUpdate] = Field(
        default_factory=list, description="Outcomes the user reports for PENDING PROMISES listed below (use their IDs)"
    )
    needs_memory: bool = Field(description="True if answering well needs past memories about the user")
    memory_query: str = Field("", description="Short search query to find relevant memories (empty if not needed)")
    needs_web_search: bool = Field(
        description="True if the user asks for current/live information (news, markets, IPOs, prices, events, latest courses)"
    )
    search_query: str = Field("", description="Web search query if needs_web_search, else empty")
    mood: str = Field(description="User's current mood in one lowercase word, e.g. happy, tired, stressed, neutral")
    mood_intensity: int = Field(5, ge=1, le=10)
    contains_new_info: bool = Field(
        description="True if the user shared durable personal info worth remembering (facts, preferences, events, feelings)"
    )


class GoalValidation(BaseModel):
    title: str = Field(description="Clean, short goal title (max 8 words). For reframe, the realistic/ethical version")
    category: Category
    tier: Literal["accept", "reframe", "refuse"] = Field(
        description="accept: safe and realistic; reframe: safe/dual-use but unrealistic or needs an ethical version; "
        "refuse: harmful or illegal — never plan it"
    )
    is_realistic: bool
    feasibility: float = Field(ge=0, le=1, description="0 = impossible in the timeframe, 1 = very achievable")
    reason: str = Field(description="1-2 sentences: why accepted / reframed / refused")
    realistic_version: str = Field("", description="If reframe: the realistic or ethical goal you propose instead")
    expert_advice: str = Field("", description="Who to consult if relevant (e.g. SEBI-registered advisor, doctor), else empty")
    needs_web_search: bool = Field(description="True if current real-world info would make the plan better")
    search_query: str = Field("", description="Web search query if needs_web_search")
    suggested_priority: Priority
    suggested_deadline_days: int = Field(ge=1, le=365, description="Sensible timeframe in days")


class PlanTodo(BaseModel):
    title: str = Field(description="Concrete action, max 8 words, e.g. 'Drink 2 glasses of water before 11am'")
    recurrence: Literal["daily", "weekly", "once"]
    time_hint: str = Field("", description="morning / afternoon / evening / anytime")


class GoalPlan(BaseModel):
    description: str = Field(description="One motivating sentence describing the goal and why it matters")
    milestones: list[str] = Field(description="3 to 5 progressive milestones", min_length=2, max_length=6)
    todos: list[PlanTodo] = Field(description="2 to 4 small recurring or one-time actions", min_length=1, max_length=5)


class FactOut(BaseModel):
    fact: str = Field(description="Durable fact or preference about the user, third person, e.g. 'User is vegetarian'")
    category: str = Field(description="health, work, family, food, hobby, schedule, finance, education, personality, other")
    kind: Literal["fact", "preference"]
    confidence: float = Field(ge=0, le=1)
    keywords: list[str] = Field(default_factory=list, max_length=5)


class ExtractionOutput(BaseModel):
    # Flat fields (no optional nested objects) parse reliably across providers.
    has_episode: bool = Field(description="False if the exchange was trivial small talk with nothing worth remembering")
    episode_summary: str = Field("", description="Third-person summary of what happened / was shared, with context (1-2 sentences)")
    episode_emotion: str = Field("neutral", description="User's emotion in one word")
    episode_importance: int = Field(5, ge=1, le=10, description="1 = trivial small talk, 10 = life-changing")
    episode_keywords: list[str] = Field(default_factory=list, max_length=6)
    facts: list[FactOut] = Field(default_factory=list, description="Only NEW durable info not already in known facts")
    character_note: str = Field(
        "", description="Short note in third person from the character's view worth telling the user's other companions "
        "(e.g. 'Arjun pushed Jay to drink 2L water today; Jay agreed but sounded tired'). Empty if nothing notable."
    )


class MergedFacts(BaseModel):
    facts: list[FactOut] = Field(description="Merged, deduplicated facts preserving all meaningful information")


class BehaviourOutput(BaseModel):
    motivation_style: Literal["strict", "gentle", "logical", "mixed"] = Field(
        description="What seems to motivate this user best"
    )
    tone_preference: str = Field(description="e.g. playful, formal, casual Hinglish")
    reply_length: Literal["short", "medium", "long"]
    recurring_struggles: list[str] = Field(default_factory=list, max_length=4)
    summary: str = Field(description="2 sentences describing how to best talk with and motivate this user")


class AdaptationOutput(BaseModel):
    should_adapt: bool = Field(description="True if there is a user interest/goal the character would plausibly pick up")
    topic: str = Field("")
    twist: str = Field("", description="How THIS character does it in their own way, first person, 1 sentence")


class LifeEventOutput(BaseModel):
    title: str
    description: str = Field(description="First person, 1-2 sentences, small realistic daily-life event")
    emotion: str


class ReflectionOutput(BaseModel):
    summary: str = Field(description="Weekly reflection in third person: wins, struggles, mood trend, 2-3 sentences")
    emotion: str
    keywords: list[str] = Field(default_factory=list, max_length=6)


class FamilyMember(BaseModel):
    name: str
    relation: str
    note: str


class CharacterDraft(BaseModel):
    avatar: str = Field(description="One emoji")
    tagline: str
    age: int = Field(ge=18, le=80)
    city: str
    occupation: str
    personality: str
    speaking_style: str
    motivation_style: str
    backstory: str
    worldview: str
    family_friends: list[FamilyMember] = Field(description="3-4 people in their life")
    interests: list[str]


class Nudge(BaseModel):
    message: str = Field(description="One or two short in-character sentences")


class CharacterComment(BaseModel):
    name: str
    comment: str = Field(description="One or two sentences in this character's own voice reacting to the week")


class WeeklyNarrative(BaseModel):
    headline: str = Field(description="Short punchy title for the week, max 8 words")
    summary: str = Field(description="2-3 sentences, second person, grounded ONLY in the given numbers")
    wins: list[str] = Field(description="2-3 concrete wins from the data", max_length=4)
    struggles: list[str] = Field(description="1-3 concrete struggles from the data", max_length=3)
    focus_next_week: str = Field(description="One specific, realistic focus for next week")
    crew: list[CharacterComment] = Field(description="One comment per crew member, in their personality")
