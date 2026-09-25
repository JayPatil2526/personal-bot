"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Check, Flame, MessageCircle, Pause, Play, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Sources } from "@/components/chat/Message";
import { startChat } from "@/components/chat/Sidebar";
import { CategoryIcon, PriorityBadge, TodoRow } from "@/components/goals";
import { Avatar, Badge, Button, Card, ProgressRing, Skeleton, chartTooltip } from "@/components/ui";
import { api } from "@/lib/api";
import type { Character, Goal } from "@/lib/types";
import { cn } from "@/lib/utils";

function Heatmap({ days }: { days: string[] }) {
  const set = new Set(days);
  const cells = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (27 - i));
    const key = d.toLocaleDateString("en-CA");
    return { key, on: set.has(key), label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
  });
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
      {cells.map((c, i) => (
        <motion.div
          key={c.key}
          title={c.label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.01 }}
          className={cn("aspect-square rounded-[5px]", c.on ? "bg-sage" : "bg-[#ececf1]")}
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
    if (done) toast.success(`Milestone reached · ${Math.round(r.progress)}%`);
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

  const history = (goal.progress_history || []).map((h) => ({
    t: new Date(h.at).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    progress: h.progress,
    note: h.note,
  }));
  const sharedWith = characters.filter((c) => goal.visibility === "all" || (goal.visibility as number[]).includes(c.id));

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <Link href="/goals" className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Goals
      </Link>

      <Card className="p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-6">
          <ProgressRing value={goal.progress} size={112} stroke={7} color="#e8590c">
            <div className="text-center">
              <CategoryIcon category={goal.category} className="mx-auto h-5 w-5 text-ink-2" />
              <div className="mt-1 text-[15px] font-medium tabular-nums">{Math.round(goal.progress)}%</div>
            </div>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <PriorityBadge priority={goal.priority} />
              <Badge className="border-line bg-subtle text-ink-2">{goal.category}</Badge>
              {goal.safety_tier === "reframed" && <Badge className="border-amber-line bg-amber-soft text-amber">reframed by AI</Badge>}
              {goal.status !== "active" && <Badge className="border-sage-line bg-sage-soft text-sage">{goal.status}</Badge>}
              <Badge className="border-line bg-subtle text-ink-2">created via {goal.created_via}</Badge>
            </div>
            <h1 className="headline mt-3 text-[32px]">{goal.title}</h1>
            <p className="mt-2 text-[15px] text-ink-2">{goal.description}</p>
            {goal.original_request && goal.safety_tier === "reframed" && (
              <p className="mt-1 text-[13px] text-muted">
                Originally: <span className="line-through">{goal.original_request}</span>
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { v: goal.streak_current, l: "streak", icon: <Flame className="mx-auto h-4 w-4 text-saffron" /> },
              { v: goal.streak_best, l: "best", icon: <Trophy className="mx-auto h-4 w-4 text-amber" /> },
              { v: goal.days_left ?? "—", l: "days left", icon: <span className="block h-4" /> },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl border border-line px-4 py-3">
                {x.icon}
                <div className="mt-1 text-[22px] font-medium tabular-nums">{x.v}</div>
                <div className="text-[11px] text-muted">{x.l}</div>
              </div>
            ))}
          </div>
        </div>
        {goal.validation_note && (
          <div className="mt-6 rounded-2xl bg-subtle p-4 text-[13px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">AI check · feasibility {Math.round(goal.feasibility * 100)}% — </span>
            {goal.validation_note}
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-[16px] font-medium">Today</h2>
          <div className="space-y-2">
            {goal.todos?.map((t) => (
              <TodoRow key={`${t.id}-${t.done_today}`} todo={{ ...t, goal_title: goal.title }} onChange={load} showGoal={false} />
            ))}
          </div>
          <h2 className="mb-3 mt-8 text-[16px] font-medium">Consistency · last 28 days</h2>
          <Heatmap days={goal.done_days || []} />
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-[16px] font-medium">
            Milestones <span className="text-[14px] font-normal text-muted tabular-nums">{goal.milestones_done}/{goal.milestones_total}</span>
          </h2>
          <div className="space-y-2">
            {goal.milestones?.map((m, i) => (
              <button
                key={m.id}
                onClick={() => toggleMilestone(m.id, !m.done)}
                className={cn("flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors", m.done ? "border-line bg-subtle" : "border-line bg-white hover:border-line-strong")}
              >
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-mono", m.done ? "border-saffron bg-saffron text-white" : "border-line-strong text-muted")}>
                  {m.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("text-[14px]", m.done ? "text-muted line-through" : "text-ink")}>{m.title}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <h2 className="text-[16px] font-medium">Progress over time</h2>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <XAxis dataKey="t" tick={{ fill: "#8b8e9c", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#8b8e9c", fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip {...chartTooltip} formatter={(v, _n, p) => [`${v}% — ${p.payload?.note ?? ""}`, "progress"]} />
                <Area type="stepAfter" dataKey="progress" stroke="#e8590c" strokeWidth={2} fill="#fff3ea" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-[16px] font-medium">Shared with</h2>
          <p className="mb-4 text-[13px] text-muted">They know this goal and nudge you in their own style.</p>
          <div className="space-y-2">
            {sharedWith.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
                <Avatar name={c.name} color={c.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] text-ink">{c.name}</div>
                  <div className="truncate text-[12px] text-muted">{c.motivation_style}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => startChat(router, { characterId: c.id })}>
                  <MessageCircle className="h-3.5 w-3.5" /> Discuss
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-[16px] font-medium">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {goal.status === "active" ? (
              <>
                <Button variant="secondary" onClick={() => setStatus("completed")}>
                  <Trophy className="h-4 w-4" /> Mark completed
                </Button>
                <Button variant="secondary" onClick={() => setStatus("paused")}>
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setStatus("active")}>
                <Play className="h-4 w-4" /> Reactivate
              </Button>
            )}
            <Button variant="danger" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
          {goal.sources && goal.sources.length > 0 && (
            <>
              <h3 className="mb-1 mt-6 text-[14px] font-medium">Sources used when planning</h3>
              <Sources sources={goal.sources} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
