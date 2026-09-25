import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Full class strings per character colour (Tailwind needs literal class names). */
export const COLORS: Record<string, { ring: string; bg: string; text: string; soft: string; grad: string; hex: string }> = {
  orange: { ring: "ring-orange-400/40", bg: "bg-orange-500/15", text: "text-orange-300", soft: "bg-orange-400/10 border-orange-400/20", grad: "from-orange-500 to-amber-400", hex: "#fb923c" },
  emerald: { ring: "ring-emerald-400/40", bg: "bg-emerald-500/15", text: "text-emerald-300", soft: "bg-emerald-400/10 border-emerald-400/20", grad: "from-emerald-500 to-teal-400", hex: "#34d399" },
  sky: { ring: "ring-sky-400/40", bg: "bg-sky-500/15", text: "text-sky-300", soft: "bg-sky-400/10 border-sky-400/20", grad: "from-sky-500 to-indigo-400", hex: "#38bdf8" },
  violet: { ring: "ring-violet-400/40", bg: "bg-violet-500/15", text: "text-violet-300", soft: "bg-violet-400/10 border-violet-400/20", grad: "from-violet-500 to-fuchsia-400", hex: "#a78bfa" },
  rose: { ring: "ring-rose-400/40", bg: "bg-rose-500/15", text: "text-rose-300", soft: "bg-rose-400/10 border-rose-400/20", grad: "from-rose-500 to-pink-400", hex: "#fb7185" },
  amber: { ring: "ring-amber-400/40", bg: "bg-amber-500/15", text: "text-amber-300", soft: "bg-amber-400/10 border-amber-400/20", grad: "from-amber-500 to-yellow-400", hex: "#fbbf24" },
};

export const colorOf = (c?: string) => COLORS[c || "violet"] || COLORS.violet;

export const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-rose-500/15 text-rose-300 border-rose-400/25",
  high: "bg-orange-500/15 text-orange-300 border-orange-400/25",
  medium: "bg-violet-500/15 text-violet-300 border-violet-400/25",
  low: "bg-slate-500/15 text-slate-300 border-slate-400/25",
};

export const CATEGORY_EMOJI: Record<string, string> = {
  health: "💧", fitness: "🏃", learning: "📚", finance: "📈", career: "💼", mindfulness: "🧘",
  lifestyle: "🌱", productivity: "⚡", social: "🤝", other: "✨",
};

export const MOOD_SCORE: Record<string, number> = {
  happy: 9, excited: 9, joyful: 9, grateful: 8, proud: 8, motivated: 8, calm: 7, content: 7, relaxed: 7, hopeful: 7,
  neutral: 5, curious: 6, okay: 5, bored: 4, confused: 4, tired: 3, stressed: 2, anxious: 2, frustrated: 2, sad: 2,
  angry: 1, overwhelmed: 2, lonely: 2, guilty: 3,
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

export const NODE_META: Record<string, { icon: string; color: string }> = {
  load_context: { icon: "📥", color: "#94a3b8" },
  classify: { icon: "🧭", color: "#a78bfa" },
  safety_guard: { icon: "🛡️", color: "#f87171" },
  progress_update: { icon: "✅", color: "#34d399" },
  goal_validator: { icon: "⚖️", color: "#fbbf24" },
  web_search: { icon: "🌐", color: "#38bdf8" },
  goal_planner: { icon: "🗺️", color: "#f472b6" },
  memory_retrieval: { icon: "🧠", color: "#c084fc" },
  responder: { icon: "💬", color: "#e879f9" },
  post_process: { icon: "💾", color: "#94a3b8" },
  bg_input: { icon: "🗂️", color: "#94a3b8" },
  job_router: { icon: "🔀", color: "#94a3b8" },
  extraction: { icon: "✍️", color: "#c084fc" },
  compression: { icon: "🗜️", color: "#60a5fa" },
  behaviour: { icon: "📊", color: "#34d399" },
  adaptation: { icon: "✨", color: "#fbbf24" },
  life_event: { icon: "🌤️", color: "#fb923c" },
  reflection: { icon: "🪞", color: "#f472b6" },
};
