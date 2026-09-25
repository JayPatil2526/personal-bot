"use client";

import { motion } from "framer-motion";
import { ArrowRight, Brain, Flame, MessageCircle, Plus, Target } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GoalCard, PriorityBadge, TodoRow } from "@/components/goals";
import { Avatar, Button, Card, Empty, ProgressRing, Skeleton, fadeUp } from "@/components/ui";
import { api } from "@/lib/api";
import type { Goal, Todo } from "@/lib/types";
import { CATEGORY_EMOJI, MOOD_SCORE, colorOf, greeting, timeAgo } from "@/lib/utils";

interface Dashboard {
  user: { name: string; patterns: Record<string, unknown> };
  today: string;
  stats: {
    active_goals: number;
    completed_goals: number;
    todos_done_today: number;
    todos_total_today: number;
    best_streak: number;
    current_streak: number;
    memories: number;
  };
  focus_goal: Goal | null;
  goals: Goal[];
  todos: Todo[];
  activity: { day: string; done: number }[];
  moods: { at: string; mood: string; intensity: number }[];
  recent_memories: { id: number; summary: string; emotion: string; when: string; kind: string }[];
}

interface NudgeRes {
  character: { id: number; name: string; avatar: string; color: string };
  message: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [nudge, setNudge] = useState<NudgeRes | null>(null);

  const load = useCallback(() => api<Dashboard>("/dashboard").then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    api<NudgeRes>("/dashboard/nudge").then(setNudge).catch(() => {});
  }, [load]);

  const replyToNudge = async () => {
    if (!nudge) return;
    const s = await api<{ id: number }>("/sessions", { method: "POST", json: { character_id: nudge.character.id } });
    router.push(`/chat/${s.id}`);
  };

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6 md:p-10">
        <Skeleton className="h-14 w-80" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const s = data.stats;
  const todayPct = s.todos_total_today ? (s.todos_done_today / s.todos_total_today) * 100 : 0;
  const moodData = data.moods.map((m) => ({ t: new Date(m.at).toLocaleDateString(undefined, { day: "numeric", month: "short" }), score: MOOD_SCORE[m.mood] ?? 5, mood: m.mood }));
  const first = data.user.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <motion.div initial="hidden" animate="show" variants={fadeUp} className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl text-white md:text-5xl">
            {greeting()}, <span className="italic text-gradient">{first}</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/goals?new=1">
            <Button variant="outline">
              <Plus className="h-4 w-4" /> New goal
            </Button>
          </Link>
          <Link href="/chat">
            <Button>
              <MessageCircle className="h-4 w-4" /> Talk to your crew
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Proactive nudge */}
      <motion.div initial="hidden" animate="show" custom={1} variants={fadeUp}>
        <Card className="relative mb-6 overflow-hidden p-5">
          {nudge ? (
            <div className="flex flex-wrap items-center gap-4">
              <Avatar emoji={nudge.character.avatar} color={nudge.character.color} size="lg" />
              <div className="min-w-0 flex-1">
                <div className={`text-xs font-medium ${colorOf(nudge.character.color).text}`}>{nudge.character.name} checked in</div>
                <p className="mt-1 text-[15px] leading-relaxed text-white">{nudge.message}</p>
              </div>
              <Button variant="outline" size="sm" onClick={replyToNudge}>
                Reply <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-14" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Today",
            value: `${s.todos_done_today}/${s.todos_total_today}`,
            sub: "todos done",
            visual: (
              <ProgressRing value={todayPct} size={52} stroke={5}>
                <span className="text-[11px] font-semibold text-white">{Math.round(todayPct)}%</span>
              </ProgressRing>
            ),
          },
          { label: "Streak", value: `${s.current_streak}`, sub: `best ${s.best_streak} days`, visual: <Flame className="h-8 w-8 text-orange-400" /> },
          { label: "Active goals", value: `${s.active_goals}`, sub: `${s.completed_goals} completed`, visual: <Target className="h-8 w-8 text-violet-300" /> },
          { label: "Memories", value: `${s.memories}`, sub: "episodes & facts", visual: <Brain className="h-8 w-8 text-fuchsia-300" /> },
        ].map((st, i) => (
          <motion.div key={st.label} initial="hidden" animate="show" custom={i + 2} variants={fadeUp}>
            <Card className="flex items-center justify-between p-5">
              <div>
                <div className="text-xs text-muted">{st.label}</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight text-white">{st.value}</div>
                <div className="text-[11px] text-muted">{st.sub}</div>
              </div>
              {st.visual}
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          {/* Focus goal */}
          {data.focus_goal ? (
            <Card className="relative overflow-hidden p-6">
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl" />
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" /> Focus goal · weight {data.focus_goal.weight}
              </div>
              <div className="mt-4 flex items-center gap-5">
                <ProgressRing value={data.focus_goal.progress} size={92} stroke={7}>
                  <div className="text-center">
                    <div className="text-xl">{CATEGORY_EMOJI[data.focus_goal.category] || "✨"}</div>
                    <div className="text-[11px] font-semibold text-white">{Math.round(data.focus_goal.progress)}%</div>
                  </div>
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <Link href={`/goals/${data.focus_goal.id}`} className="text-xl font-semibold text-white hover:underline">
                    {data.focus_goal.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{data.focus_goal.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <PriorityBadge priority={data.focus_goal.priority} />
                    {data.focus_goal.streak_current > 0 && (
                      <span className="flex items-center gap-1 text-xs text-orange-300">
                        <Flame className="h-3.5 w-3.5" /> {data.focus_goal.streak_current}-day streak
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <Empty
                icon="🎯"
                title="No goals yet"
                text="Tell any crew member what you want to work on — or create a goal and let the AI plan it."
                action={
                  <Link href="/goals?new=1">
                    <Button>
                      <Plus className="h-4 w-4" /> Create your first goal
                    </Button>
                  </Link>
                }
              />
            </Card>
          )}

          {/* Today's todos */}
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium text-white">Today&apos;s plan</h2>
              <span className="text-xs text-muted">
                {s.todos_done_today} of {s.todos_total_today} done
              </span>
            </div>
            <div className="space-y-2">
              {data.todos.length ? (
                data.todos.map((t) => <TodoRow key={`${t.id}-${t.done_today}`} todo={t} onChange={load} />)
              ) : (
                <p className="py-6 text-center text-sm text-muted">No todos for today yet.</p>
              )}
            </div>
          </Card>

          {/* Goals */}
          {data.goals.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-medium text-white">Goals by priority weight</h2>
                <Link href="/goals" className="text-xs text-muted hover:text-white">
                  View all →
                </Link>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {data.goals.slice(0, 4).map((g, i) => (
                  <GoalCard key={g.id} goal={g} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-medium text-white">Activity</h2>
            <p className="text-xs text-muted">Todos completed · last 14 days</p>
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.activity}>
                  <defs>
                    <linearGradient id="barG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d946ef" />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tickFormatter={(d) => new Date(d).getDate().toString()} tick={{ fill: "#8b8b9e", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#14141d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="done" fill="url(#barG)" radius={[6, 6, 2, 2]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-medium text-white">Mood trend</h2>
            <p className="text-xs text-muted">Detected from your conversations</p>
            <div className="mt-4 h-36">
              {moodData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={moodData}>
                    <XAxis dataKey="t" hide />
                    <YAxis domain={[0, 10]} hide />
                    <Tooltip
                      formatter={(_, __, p) => [p.payload.mood, "mood"]}
                      contentStyle={{ background: "#14141d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="score" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3, fill: "#34d399" }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-10 text-center text-sm text-muted">Chat a bit and your mood trend appears here.</p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium text-white">Recent memories</h2>
              <Link href="/memory" className="text-xs text-muted hover:text-white">
                All →
              </Link>
            </div>
            <div className="space-y-3">
              {data.recent_memories.length ? (
                data.recent_memories.map((m) => (
                  <div key={m.id} className="border-l-2 border-violet-400/30 pl-3">
                    <p className="text-sm text-soft">{m.summary}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {m.kind === "reflection" ? "🪞 reflection" : m.emotion} · {timeAgo(m.when)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-muted">Memories form as you chat.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
