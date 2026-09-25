"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Check, Flame, MessageCircle, Pause, Play, Sparkles, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Sources } from "@/components/chat/Message";
import { PriorityBadge, TodoRow } from "@/components/goals";
import { Avatar, Badge, Button, Card, ProgressRing, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { Character, Goal } from "@/lib/types";
import { CATEGORY_EMOJI, cn } from "@/lib/utils";

function Heatmap({ days }: { days: string[] }) {
  const set = new Set(days);
  const cells = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (27 - i));
    const key = d.toLocaleDateString("en-CA");
    return { key, on: set.has(key), label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
  });
  return (
    <div className="grid grid-cols-14 gap-1.5" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
      {cells.map((c, i) => (
        <motion.div
          key={c.key}
          title={c.label}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.012 }}
          className={cn("aspect-square rounded-md", c.on ? "bg-gradient-to-br from-fuchsia-500 to-orange-400 shadow-[0_0_12px_-2px_rgba(217,70,239,0.6)]" : "bg-white/[0.05]")}
        />
      ))}
    </div>
  );
}

export default function GoalDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);

  const load = useCallback(() => api<Goal>(`/goals/${id}`).then(setGoal).catch(() => router.push("/goals")), [id, router]);
  useEffect(() => {
    load();
    api<Character[]>("/characters").then(setCharacters).catch(() => {});
  }, [load]);

  if (!goal) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6 md:p-10">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const toggleMilestone = async (mid: number, done: boolean) => {
    const r = await api<{ delta: number; progress: number }>(`/milestones/${mid}/toggle`, { method: "POST", json: { done } });
    if (done) toast.success(`Milestone reached! +${r.delta}% → ${Math.round(r.progress)}%`);
    load();
  };
  const setStatus = async (status: Goal["status"]) => {
    await api(`/goals/${goal.id}`, { method: "PATCH", json: { status } });
    load();
  };
  const remove = async () => {
    if (!confirm("Delete this goal and its history?")) return;
    await api(`/goals/${goal.id}`, { method: "DELETE" });
    router.push("/goals");
  };
  const discuss = async (c: Character) => {
    const s = await api<{ id: number }>("/sessions", { method: "POST", json: { character_id: c.id } });
    router.push(`/chat/${s.id}`);
  };

  const history = (goal.progress_history || []).map((h) => ({
    t: new Date(h.at).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    progress: h.progress,
    note: h.note,
  }));
  const sharedWith = characters.filter((c) => goal.visibility === "all" || (goal.visibility as number[]).includes(c.id));

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <Link href="/goals" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Goals
      </Link>

      <Card className="relative overflow-hidden p-6 md:p-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-6">
          <ProgressRing value={goal.progress} size={120} stroke={9}>
            <div className="text-center">
              <div className="text-2xl">{CATEGORY_EMOJI[goal.category] || "✨"}</div>
              <div className="text-sm font-semibold text-white">{Math.round(goal.progress)}%</div>
            </div>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge priority={goal.priority} />
              <Badge className="border-white/10 bg-white/5 text-muted">{goal.category}</Badge>
              {goal.safety_tier === "reframed" && (
                <Badge className="border-amber-400/25 bg-amber-400/10 text-amber-300">
                  <Sparkles className="h-3 w-3" /> AI-reframed
                </Badge>
              )}
              {goal.status !== "active" && <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-300">{goal.status}</Badge>}
              <Badge className="border-white/10 bg-white/5 text-muted">via {goal.created_via}</Badge>
            </div>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">{goal.title}</h1>
            <p className="mt-1 text-sm text-muted">{goal.description}</p>
            {goal.original_request && goal.safety_tier === "reframed" && (
              <p className="mt-1 text-xs text-muted">
                Originally: <span className="line-through">{goal.original_request}</span>
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { v: goal.streak_current, l: "streak", icon: <Flame className="mx-auto h-4 w-4 text-orange-400" /> },
              { v: goal.streak_best, l: "best", icon: <Trophy className="mx-auto h-4 w-4 text-amber-300" /> },
              { v: goal.days_left ?? "∞", l: "days left", icon: <span className="block text-sm">⏳</span> },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                {x.icon}
                <div className="mt-1 text-xl font-semibold text-white">{x.v}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted">{x.l}</div>
              </div>
            ))}
          </div>
        </div>
        {goal.validation_note && (
          <div className="relative mt-6 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-xs leading-relaxed text-soft">
            <span className="font-medium text-white">AI validation · feasibility {Math.round(goal.feasibility * 100)}% — </span>
            {goal.validation_note}
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 font-medium text-white">Today&apos;s todos</h2>
          <div className="space-y-2">
            {goal.todos?.map((t) => (
              <TodoRow key={`${t.id}-${t.done_today}`} todo={{ ...t, goal_title: goal.title }} onChange={load} showGoal={false} />
            ))}
          </div>
          <h2 className="mb-3 mt-8 font-medium text-white">Consistency · last 28 days</h2>
          <Heatmap days={goal.done_days || []} />
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 font-medium text-white">
            Milestones{" "}
            <span className="text-sm font-normal text-muted">
              {goal.milestones_done}/{goal.milestones_total}
            </span>
          </h2>
          <div className="relative space-y-3 pl-5">
            <div className="absolute bottom-3 left-[9px] top-3 w-px bg-white/10" />
            {goal.milestones?.map((m) => (
              <button key={m.id} onClick={() => toggleMilestone(m.id, !m.done)} className="relative flex w-full items-center gap-3 text-left">
                <span
                  className={cn(
                    "absolute -left-5 flex h-[18px] w-[18px] items-center justify-center rounded-full border ring-4 ring-[#0b0b11] transition",
                    m.done ? "border-fuchsia-400 bg-fuchsia-500 text-white" : "border-white/25 bg-[#0e0e15]",
                  )}
                >
                  {m.done && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className={cn("rounded-xl border px-3 py-2.5 text-sm transition flex-1", m.done ? "border-fuchsia-400/20 bg-fuchsia-400/[0.06] text-white" : "border-white/[0.06] bg-white/[0.02] text-soft hover:border-white/15")}>
                  {m.title}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="font-medium text-white">Progress over time</h2>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d946ef" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tick={{ fill: "#8b8b9e", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#8b8b9e", fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  formatter={(v, _n, p) => [`${v}% — ${p.payload?.note ?? ""}`, "progress"]}
                  contentStyle={{ background: "#14141d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                />
                <Area type="stepAfter" dataKey="progress" stroke="#e879f9" strokeWidth={2} fill="url(#pg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 font-medium text-white">Shared with your crew</h2>
          <p className="mb-4 text-xs text-muted">They know this goal and will nudge you in their own style.</p>
          <div className="space-y-2">
            {sharedWith.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <Avatar emoji={c.avatar} color={c.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white">{c.name}</div>
                  <div className="truncate text-[11px] text-muted">{c.motivation_style}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => discuss(c)}>
                  <MessageCircle className="h-3.5 w-3.5" /> Discuss
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 font-medium text-white">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {goal.status === "active" ? (
              <>
                <Button variant="outline" onClick={() => setStatus("completed")}>
                  <Trophy className="h-4 w-4" /> Mark completed
                </Button>
                <Button variant="outline" onClick={() => setStatus("paused")}>
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setStatus("active")}>
                <Play className="h-4 w-4" /> Reactivate
              </Button>
            )}
            <Button variant="danger" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
          {goal.sources && goal.sources.length > 0 && (
            <>
              <h3 className="mb-1 mt-6 text-sm font-medium text-white">Sources the AI used</h3>
              <Sources sources={goal.sources} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
