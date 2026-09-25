"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Flame, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, ProgressBar, ProgressRing } from "@/components/ui";
import { api } from "@/lib/api";
import type { Goal, Todo } from "@/lib/types";
import { CATEGORY_EMOJI, PRIORITY_STYLE, cn } from "@/lib/utils";

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge className={PRIORITY_STYLE[priority]}>{priority}</Badge>;
}

export function Burst({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {Array.from({ length: 10 }).map((_, i) => (
            <motion.span
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full"
              style={{ background: ["#a78bfa", "#f472b6", "#fb923c", "#34d399"][i % 4] }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: Math.cos((i / 10) * Math.PI * 2) * 26, y: Math.sin((i / 10) * Math.PI * 2) * 26, opacity: 0, scale: 0.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

export function TodoRow({ todo, onChange, showGoal = true }: { todo: Todo; onChange?: () => void; showGoal?: boolean }) {
  const [done, setDone] = useState(todo.done_today);
  const [burst, setBurst] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !done;
    setDone(next);
    setBusy(true);
    if (next) {
      setBurst(true);
      setTimeout(() => setBurst(false), 650);
    }
    try {
      const r = await api<{ delta: number; progress: number; streak: number; goal_status: string }>(`/todos/${todo.id}/toggle`, {
        method: "POST",
        json: { done: next },
      });
      if (next) {
        toast.success(`+${r.delta}% · ${todo.goal_title ?? "Goal"} now ${Math.round(r.progress)}%`, {
          description: r.streak ? `🔥 ${r.streak}-day streak` : undefined,
        });
        if (r.goal_status === "completed") toast("🏆 Goal completed! Your crew is proud of you.");
      }
      onChange?.();
    } catch (e) {
      setDone(!next);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.button
      layout
      onClick={toggle}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
        done ? "border-emerald-400/15 bg-emerald-400/[0.04]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/15",
      )}
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <motion.span
          animate={{ scale: done ? [1, 1.25, 1] : 1 }}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-md border transition",
            done ? "border-emerald-400 bg-emerald-400 text-black" : "border-white/25 group-hover:border-white/50",
          )}
        >
          {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </motion.span>
        <Burst show={burst} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", done ? "text-muted line-through" : "text-white")}>{todo.title}</span>
        {showGoal && todo.goal_title && <span className="block truncate text-[11px] text-muted">{todo.goal_title}</span>}
      </span>
      <span className="shrink-0 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
        {todo.time_hint || todo.recurrence}
      </span>
    </motion.button>
  );
}

export function GoalCard({ goal, index = 0 }: { goal: Goal; index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Link href={`/goals/${goal.id}`} className="glass group block rounded-2xl p-5 transition hover:border-white/15 hover:bg-white/[0.04]">
        <div className="flex items-start gap-4">
          <ProgressRing value={goal.progress} size={56} stroke={5}>
            <span className="text-lg">{CATEGORY_EMOJI[goal.category] || "✨"}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge priority={goal.priority} />
              {goal.safety_tier === "reframed" && (
                <Badge className="border-amber-400/25 bg-amber-400/10 text-amber-300">
                  <Sparkles className="h-3 w-3" /> reframed
                </Badge>
              )}
              {goal.status === "completed" && <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-300">completed</Badge>}
            </div>
            <div className="mt-1.5 truncate font-medium text-white group-hover:text-gradient">{goal.title}</div>
            <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
              <span>{Math.round(goal.progress)}% overall</span>
              <span>·</span>
              <span>
                {goal.today_done}/{goal.today_total} today
              </span>
              {goal.streak_current > 0 && (
                <span className="flex items-center gap-0.5 text-orange-300">
                  <Flame className="h-3 w-3" /> {goal.streak_current}
                </span>
              )}
              {goal.days_left !== null && <span className="ml-auto">{goal.days_left}d left</span>}
            </div>
            <ProgressBar value={goal.today_total ? (goal.today_done / goal.today_total) * 100 : 0} className="mt-2" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
