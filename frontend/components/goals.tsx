"use client";

import { motion } from "framer-motion";
import { Check, Flame } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, ProgressBar, ProgressRing } from "@/components/ui";
import { api } from "@/lib/api";
import type { Goal, Todo } from "@/lib/types";
import { CATEGORY_ICON, PRIORITY_STYLE, cn } from "@/lib/utils";

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge className={PRIORITY_STYLE[priority]}>{priority}</Badge>;
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICON[category] || CATEGORY_ICON.other;
  return <Icon className={cn("h-4 w-4", className)} strokeWidth={1.8} />;
}

export function TodoRow({ todo, onChange, showGoal = true }: { todo: Todo; onChange?: () => void; showGoal?: boolean }) {
  const [done, setDone] = useState(todo.done_today);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !done;
    setDone(next);
    setBusy(true);
    try {
      const r = await api<{ delta: number; progress: number; streak: number; goal_status: string }>(`/todos/${todo.id}/toggle`, {
        method: "POST",
        json: { done: next },
      });
      if (next) {
        toast.success(`${todo.goal_title ?? "Goal"} · ${Math.round(r.progress)}%`, {
          description: r.streak ? `${r.streak}-day streak` : `+${r.delta}% progress`,
        });
        if (r.goal_status === "completed") toast("Goal completed. Your crew is proud of you.");
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
        "group flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors",
        done ? "border-line bg-subtle" : "border-line bg-white hover:border-line-strong",
      )}
    >
      <motion.span
        animate={{ scale: done ? [1, 1.15, 1] : 1 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          done ? "border-sage bg-sage text-white" : "border-line-strong bg-white group-hover:border-ink-2",
        )}
      >
        {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </motion.span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[14px]", done ? "text-muted line-through decoration-muted/60" : "text-ink")}>{todo.title}</span>
        {showGoal && todo.goal_title && <span className="block truncate text-[12px] text-muted">{todo.goal_title}</span>}
      </span>
      <span className="shrink-0 text-[11px] capitalize text-muted">{todo.time_hint || todo.recurrence}</span>
    </motion.button>
  );
}

export function GoalCard({ goal, index = 0 }: { goal: Goal; index?: number }) {
  const todayPct = goal.today_total ? (goal.today_done / goal.today_total) * 100 : 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
      <Link href={`/goals/${goal.id}`} className="card group block p-5 transition-colors hover:border-line-strong">
        <div className="flex items-start gap-4">
          <ProgressRing value={goal.progress} size={52} stroke={4}>
            <CategoryIcon category={goal.category} className="text-ink-2" />
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <PriorityBadge priority={goal.priority} />
              {goal.safety_tier === "reframed" && <Badge className="border-amber-line bg-amber-soft text-amber">reframed</Badge>}
              {goal.status === "completed" && <Badge className="border-sage-line bg-sage-soft text-sage">completed</Badge>}
            </div>
            <div className="mt-2 truncate text-[15px] font-medium text-ink">{goal.title}</div>
            <div className="mt-3 flex items-center gap-3 text-[12px] text-muted">
              <span className="tabular-nums">{Math.round(goal.progress)}% overall</span>
              <span className="tabular-nums">
                {goal.today_done}/{goal.today_total} today
              </span>
              {goal.streak_current > 0 && (
                <span className="flex items-center gap-0.5 text-saffron">
                  <Flame className="h-3 w-3" /> {goal.streak_current}
                </span>
              )}
              {goal.days_left !== null && <span className="ml-auto">{goal.days_left}d left</span>}
            </div>
            <ProgressBar value={todayPct} className="mt-2" color="#4d7c2a" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
