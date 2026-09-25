"use client";

import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Flame, MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryIcon, GoalCard, PriorityBadge, TodoRow } from "@/components/goals";
import { PromiseRow } from "@/components/PromiseRow";
import { Avatar, Button, Card, Empty, ProgressRing, Skeleton, Stat, chartTooltip, fadeUp } from "@/components/ui";
import { api } from "@/lib/api";
import type { Goal, Promise_, Todo } from "@/lib/types";
import { MOOD_SCORE, cn, colorOf, greeting, timeAgo } from "@/lib/utils";

interface Dashboard {
  user: { name: string };
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
  promises: Promise_[];
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

  const openChat = async (characterId: number) => {
    const s = await api<{ id: number }>("/sessions", { method: "POST", json: { character_id: characterId } });
    router.push(`/chat/${s.id}`);
  };

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6 md:p-10">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-24" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const s = data.stats;
  const todayPct = s.todos_total_today ? (s.todos_done_today / s.todos_total_today) * 100 : 0;
  const moodData = data.moods.map((m) => ({ score: MOOD_SCORE[m.mood] ?? 5, mood: m.mood }));
  const first = data.user.name.split(" ")[0];
  const nc = nudge ? colorOf(nudge.character.color) : null;

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <motion.div initial="hidden" animate="show" variants={fadeUp} className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-3">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="headline text-[34px] md:text-[44px]">
            {greeting()}, {first}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/goals?new=1">
            <Button variant="secondary">
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

      {/* Proactive check-in, styled as an incoming message */}
      <motion.div initial="hidden" animate="show" custom={1} variants={fadeUp} className="mb-6">
        {nudge && nc ? (
          <div className={cn("flex flex-wrap items-center gap-4 rounded-3xl border p-5", nc.soft, nc.line)}>
            <Avatar name={nudge.character.name} color={nudge.character.color} size="lg" />
            <div className="min-w-0 flex-1">
              <div className={cn("text-[12px] font-semibold", nc.text)}>{nudge.character.name} · just now</div>
              <p className="mt-0.5 text-[15px] leading-relaxed text-ink">{nudge.message}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => openChat(nudge.character.id)}>
              Reply <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Skeleton className="h-[88px]" />
        )}
      </motion.div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <motion.div initial="hidden" animate="show" custom={2} variants={fadeUp}>
          <Card className="flex items-center justify-between p-5">
            <div>
              <div className="text-[13px] text-muted">Today</div>
              <div className="mt-1.5 text-[30px] font-medium leading-none tracking-tight tabular-nums">
                {s.todos_done_today}/{s.todos_total_today}
              </div>
              <div className="mt-2 text-[12px] text-muted">habits done</div>
            </div>
            <ProgressRing value={todayPct} size={54} stroke={5} color="#4d7c2a">
              <span className="text-[11px] font-medium tabular-nums">{Math.round(todayPct)}%</span>
            </ProgressRing>
          </Card>
        </motion.div>
        <motion.div initial="hidden" animate="show" custom={3} variants={fadeUp}>
          <Stat
            label="Current streak"
            value={
              <span className="flex items-center gap-2">
                {s.current_streak} <Flame className="h-6 w-6 text-saffron" />
              </span>
            }
            sub={`best ${s.best_streak} days`}
          />
        </motion.div>
        <motion.div initial="hidden" animate="show" custom={4} variants={fadeUp}>
          <Stat label="Open promises" value={data.promises.length} sub={<Link href="/promises" className="underline underline-offset-2">view all</Link>} />
        </motion.div>
        <motion.div initial="hidden" animate="show" custom={5} variants={fadeUp}>
          <Stat label="Memories" value={s.memories} sub="episodes & facts" />
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          {data.focus_goal ? (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div className="eyebrow">Focus goal</div>
                <span className="font-mono text-[11px] text-muted">priority weight {data.focus_goal.weight}</span>
              </div>
              <div className="mt-5 flex items-center gap-5">
                <ProgressRing value={data.focus_goal.progress} size={84} stroke={6} color="#e8590c">
                  <div className="text-center">
                    <CategoryIcon category={data.focus_goal.category} className="mx-auto text-ink-2" />
                    <div className="mt-0.5 text-[12px] font-medium tabular-nums">{Math.round(data.focus_goal.progress)}%</div>
                  </div>
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <Link href={`/goals/${data.focus_goal.id}`} className="group inline-flex items-center gap-1 text-[20px] font-medium tracking-tight text-ink">
                    {data.focus_goal.title}
                    <ArrowUpRight className="h-4 w-4 text-muted transition group-hover:text-ink" />
                  </Link>
                  <p className="mt-1 line-clamp-2 text-[14px] text-ink-2">{data.focus_goal.description}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <PriorityBadge priority={data.focus_goal.priority} />
                    {data.focus_goal.streak_current > 0 && (
                      <span className="flex items-center gap-1 text-[12px] text-saffron">
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
                title="No goals yet"
                text="Tell any crew member what you want to work on, or create a goal and let the AI plan it."
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

          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-medium">Today&apos;s plan</h2>
              <span className="text-[13px] text-muted tabular-nums">
                {s.todos_done_today} of {s.todos_total_today}
              </span>
            </div>
            <div className="space-y-2">
              {data.todos.length ? (
                data.todos.map((t) => <TodoRow key={`${t.id}-${t.done_today}`} todo={t} onChange={load} />)
              ) : (
                <p className="py-6 text-center text-sm text-muted">Nothing planned for today.</p>
              )}
            </div>
          </Card>

          {data.goals.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[16px] font-medium">Goals</h2>
                <Link href="/goals" className="text-[13px] text-muted hover:text-ink">
                  View all
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
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-medium">Promises</h2>
              <Link href="/promises" className="text-[13px] text-muted hover:text-ink">
                All
              </Link>
            </div>
            <div className="space-y-2">
              {data.promises.length ? (
                data.promises.map((p) => <PromiseRow key={p.id} p={p} onChange={load} />)
              ) : (
                <p className="py-4 text-center text-[13px] leading-relaxed text-muted">
                  Say &ldquo;I&apos;ll go for a walk tonight&rdquo; in chat — it becomes a promise your crew follows up on.
                </p>
              )}
            </div>
          </Card>

          <Link href="/insights" className="card group flex items-center justify-between p-5 transition-colors hover:border-line-strong">
            <div>
              <div className="eyebrow">Weekly report</div>
              <div className="mt-1.5 text-[15px] font-medium text-ink">See how your week went — from your own data</div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-muted transition group-hover:text-ink" />
          </Link>

          <Card className="p-6">
            <h2 className="text-[16px] font-medium">Activity</h2>
            <p className="text-[13px] text-muted">Habits completed, last 14 days</p>
            <div className="mt-4 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.activity}>
                  <XAxis dataKey="day" tickFormatter={(d) => new Date(d).getDate().toString()} tick={{ fill: "#8b8e9c", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip {...chartTooltip} />
                  <Bar dataKey="done" fill="#1e2033" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-[16px] font-medium">Mood</h2>
            <p className="text-[13px] text-muted">Detected from your conversations</p>
            <div className="mt-4 h-28">
              {moodData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={moodData}>
                    <YAxis domain={[0, 10]} hide />
                    <Tooltip {...chartTooltip} formatter={(_, __, p) => [p.payload?.mood, "mood"]} labelFormatter={() => ""} />
                    <Line type="monotone" dataKey="score" stroke="#4d7c2a" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-muted">Chat a little and your mood trend appears here.</p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-medium">Recent memories</h2>
              <Link href="/memory" className="text-[13px] text-muted hover:text-ink">
                All
              </Link>
            </div>
            <div className="space-y-3">
              {data.recent_memories.length ? (
                data.recent_memories.map((m) => (
                  <div key={m.id} className="border-l-2 border-line-strong pl-3">
                    <p className="text-[14px] leading-relaxed text-ink-2">{m.summary}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {m.kind === "reflection" ? "weekly reflection" : m.emotion} · {timeAgo(m.when)}
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
