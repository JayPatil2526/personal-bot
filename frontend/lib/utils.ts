import { clsx, type ClassValue } from "clsx";
import {
  Activity,
  BookOpen,
  Brain,
  Briefcase,
  CalendarCheck,
  Database,
  Dumbbell,
  FileSearch,
  Globe,
  Handshake,
  HeartPulse,
  Layers,
  ListChecks,
  type LucideIcon,
  Map,
  MessageSquareText,
  PenLine,
  Route,
  Save,
  ScanSearch,
  Scale,
  ShieldCheck,
  Sparkles,
  Sprout,
  Sun,
  TrendingUp,
  Users,
  Wind,
  Zap,
} from "lucide-react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Character palette — literal class strings so Tailwind can see them. */
export const COLORS: Record<string, { text: string; soft: string; line: string; solid: string; hex: string; softHex: string }> = {
  saffron: { text: "text-saffron", soft: "bg-saffron-soft", line: "border-saffron-line", solid: "bg-saffron", hex: "#e8590c", softHex: "#fff3ea" },
  sage: { text: "text-sage", soft: "bg-sage-soft", line: "border-sage-line", solid: "bg-sage", hex: "#4d7c2a", softHex: "#eef5e6" },
  indigo: { text: "text-indigo", soft: "bg-indigo-soft", line: "border-indigo-line", solid: "bg-indigo", hex: "#4f5bd5", softHex: "#eef0fd" },
  rose: { text: "text-rose", soft: "bg-rose-soft", line: "border-rose-line", solid: "bg-rose", hex: "#cf3d5a", softHex: "#fdeef1" },
  amber: { text: "text-amber", soft: "bg-amber-soft", line: "border-amber-line", solid: "bg-amber", hex: "#b7791f", softHex: "#fdf6e7" },
  crew: { text: "text-ink", soft: "bg-subtle", line: "border-line-strong", solid: "bg-ink", hex: "#1e2033", softHex: "#f4f4f6" },
};
// Older colour names map onto the new palette
const ALIAS: Record<string, string> = { orange: "saffron", emerald: "sage", sky: "indigo", violet: "indigo" };
export const colorOf = (c?: string) => COLORS[ALIAS[c || ""] || c || "indigo"] || COLORS.indigo;

export const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-rose-soft text-rose border-rose-line",
  high: "bg-saffron-soft text-saffron border-saffron-line",
  medium: "bg-indigo-soft text-indigo border-indigo-line",
  low: "bg-subtle text-ink-2 border-line",
};

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  health: HeartPulse, fitness: Dumbbell, learning: BookOpen, finance: TrendingUp, career: Briefcase,
  mindfulness: Wind, lifestyle: Sprout, productivity: Zap, social: Users, other: Sparkles,
};

export const MOOD_SCORE: Record<string, number> = {
  happy: 9, excited: 9, joyful: 9, grateful: 8, proud: 8, motivated: 8, determined: 8, calm: 7, content: 7, relaxed: 7,
  hopeful: 7, neutral: 5, curious: 6, okay: 5, mixed: 5, bored: 4, confused: 4, tired: 3, lazy: 4, stressed: 2,
  anxious: 2, frustrated: 2, sad: 2, angry: 1, overwhelmed: 2, lonely: 2, guilty: 3,
};

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function dueLabel(daysLeft: number) {
  if (daysLeft < -1) return `${-daysLeft} days overdue`;
  if (daysLeft === -1) return "due yesterday";
  if (daysLeft === 0) return "due today";
  if (daysLeft === 1) return "due tomorrow";
  return `in ${daysLeft} days`;
}

export const NODE_META: Record<string, { icon: LucideIcon; color: string }> = {
  load_context: { icon: Database, color: "#8b8e9c" },
  classify: { icon: ScanSearch, color: "#4f5bd5" },
  safety_guard: { icon: ShieldCheck, color: "#cf3d5a" },
  progress_update: { icon: ListChecks, color: "#4d7c2a" },
  commitments: { icon: Handshake, color: "#b7791f" },
  goal_validator: { icon: Scale, color: "#b7791f" },
  web_search: { icon: Globe, color: "#4f5bd5" },
  goal_planner: { icon: Map, color: "#e8590c" },
  memory_retrieval: { icon: Brain, color: "#4f5bd5" },
  responder: { icon: MessageSquareText, color: "#1e2033" },
  post_process: { icon: Save, color: "#8b8e9c" },
  bg_input: { icon: Layers, color: "#8b8e9c" },
  job_router: { icon: Route, color: "#8b8e9c" },
  extraction: { icon: PenLine, color: "#4f5bd5" },
  compression: { icon: FileSearch, color: "#8b8e9c" },
  behaviour: { icon: Activity, color: "#4d7c2a" },
  adaptation: { icon: Sparkles, color: "#b7791f" },
  life_event: { icon: Sun, color: "#e8590c" },
  reflection: { icon: CalendarCheck, color: "#cf3d5a" },
};
