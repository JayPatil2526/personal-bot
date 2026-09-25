export type Priority = "low" | "medium" | "high" | "urgent";

export interface User {
  id: number;
  name: string;
  email: string;
  timezone: string;
  is_developer: boolean;
  patterns: Record<string, unknown>;
}

export interface Character {
  id: number;
  name: string;
  avatar: string;
  color: string;
  tagline: string;
  age: number;
  city: string;
  occupation: string;
  personality: string;
  speaking_style: string;
  motivation_style: string;
  backstory: string;
  worldview: string;
  family_friends: { name: string; relation: string; note: string }[];
  interests: string[];
  is_preset: boolean;
  bond_level: "new" | "friend" | "close";
  messages_count: number;
  is_group?: boolean;
  crew?: Character[];
  life_events?: { title: string; description: string; emotion: string; shared: boolean; created_at: string }[];
}

export interface Todo {
  id: number;
  title: string;
  recurrence: "daily" | "weekly" | "once";
  time_hint: string;
  goal_id: number;
  done_today: boolean;
  total_done: number;
  goal_title?: string;
  goal_priority?: Priority;
  goal_category?: string;
}

export interface Goal {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  deadline: string | null;
  days_left: number | null;
  status: "active" | "completed" | "paused";
  progress: number;
  today_done: number;
  today_total: number;
  streak_current: number;
  streak_best: number;
  weight: number;
  feasibility: number;
  safety_tier: "safe" | "reframed";
  validation_note: string;
  visibility: "all" | number[];
  created_via: "form" | "chat";
  created_at: string;
  milestones_done: number;
  milestones_total: number;
  milestones?: { id: number; title: string; done: boolean }[];
  todos?: Todo[];
  sources?: Source[];
  original_request?: string;
  progress_history?: { at: string; progress: number; delta: number; source: string; note: string }[];
  done_days?: string[];
}

export interface Source {
  title: string;
  url: string;
  snippet: string;
}

export interface Chip {
  type: "goal" | "memory" | "web" | "progress" | "safety" | "crew" | "promise";
  text: string;
}

export interface Validation {
  title: string;
  category: string;
  tier: "accept" | "reframe" | "refuse";
  is_realistic: boolean;
  feasibility: number;
  reason: string;
  realistic_version: string;
  expert_advice: string;
  needs_web_search: boolean;
  search_query: string;
  suggested_priority: Priority;
  suggested_deadline_days: number;
}

export interface MessageMeta {
  character_id?: number;
  chips?: Chip[];
  memory_chips?: Chip[];
  cards?: { type: "goal" | "refused"; goal?: Goal; validation?: Validation }[];
  sources?: Source[];
  steps?: { node: string; label: string; ms: number; note: string; status: string }[];
  trace_id?: number;
  intent?: string;
  mood?: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  meta: MessageMeta;
  created_at: string;
}

export interface SessionSummary {
  id: number;
  title: string;
  is_group: boolean;
  updated_at: string;
  character: Pick<Character, "id" | "name" | "avatar" | "color">;
  last_message: string;
}

export interface SessionDetail {
  id: number;
  title: string;
  is_group: boolean;
  character: Character;
  messages: ChatMessage[];
}

export interface Step {
  node: string;
  label: string;
  phase: "foreground" | "background";
  status: "running" | "done" | "error";
  ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  providers?: string[];
  note?: string;
  detail?: unknown;
}

export interface MemoryItem {
  type: "episode" | "fact" | "preference";
  id: number;
  text: string;
  emotion?: string;
  category?: string;
  importance: number;
  character?: string | null;
  when: string;
  distance: number | null;
  recency: number;
  rerank: number | null;
  keyword_bonus: number;
  relevance: number;
  score: number;
}

export interface Trace {
  id: number;
  kind: "chat" | "background" | "goal_preview";
  session_id: number | null;
  message_id: number | null;
  user_message: string;
  nodes: (Step & { fallback?: boolean })[];
  route: string[];
  retrieved: MemoryItem[];
  total_ms: number;
  input_tokens: number;
  output_tokens: number;
  providers: string[];
  created_at: string;
}

export interface Promise_ {
  id: number;
  text: string;
  due_date: string;
  status: "pending" | "kept" | "broken";
  days_left: number;
  character: { name: string; avatar: string; color: string } | null;
  followed_up: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface WeeklyReport {
  period_start: string;
  period_end: string;
  generated_at: string;
  stats: {
    period: { start: string; end: string };
    completion: { this_week: number | null; last_week: number | null; change: number | null };
    days: { day: string; label: string; done: number; planned: number; rate: number | null; partial: boolean }[];
    best_weekday: string | null;
    streaks: { best_current: number; best_ever: number };
    mood: {
      average: number | null;
      top: [string, number][];
      todos_on_good_days: number | null;
      todos_on_low_days: number | null;
      correlation: number | null;
      days_with_mood: number;
    };
    promises: { total: number; kept: number; broken: number; pending: number; kept_rate: number | null; items: { text: string; status: string; due: string }[] };
    goals: { id: number; title: string; category: string; progress: number; streak: number; week_done: number; week_planned: number; week_rate: number }[];
    memory: { episodes: number; new_facts: number; themes: [string, number][] };
    conversations: { character: string; messages: number }[];
  };
  narrative: {
    headline: string;
    summary: string;
    wins: string[];
    struggles: string[];
    focus_next_week: string;
    crew: { name: string; comment: string }[];
  };
}
