"use client";

import { Plus, Target } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import GoalWizard from "@/components/GoalWizard";
import { GoalCard } from "@/components/goals";
import { Button, Card, Empty, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { Goal } from "@/lib/types";

function GoalsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [filter, setFilter] = useState<"active" | "completed" | "all">("active");
  const [wizard, setWizard] = useState(params.get("new") === "1");

  const load = useCallback(() => {
    api<Goal[]>(`/goals${filter === "all" ? "" : `?status=${filter}`}`).then(setGoals).catch(() => {});
  }, [filter]);
  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader
        eyebrow="Goals"
        title="What you're working toward"
        subtitle="Every goal is checked for safety and feasibility, broken into milestones and daily habits, and shared with your crew."
        action={
          <Button onClick={() => setWizard(true)}>
            <Plus className="h-4 w-4" /> New goal
          </Button>
        }
      />
      <div className="mb-6">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: "Active" },
            { value: "completed", label: "Completed" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      {!goals ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : goals.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {goals.map((g, i) => (
            <GoalCard key={g.id} goal={g} index={i} />
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            icon={<Target className="h-5 w-5" />}
            title={filter === "completed" ? "No completed goals yet" : "No goals here yet"}
            text="Create one here, or just tell a crew member in chat — for example “I want to drink more water”."
            action={
              <Button onClick={() => setWizard(true)}>
                <Plus className="h-4 w-4" /> Create a goal
              </Button>
            }
          />
        </Card>
      )}
      <GoalWizard open={wizard} onClose={() => setWizard(false)} onCreated={(g) => router.push(`/goals/${g.id}`)} />
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense>
      <GoalsInner />
    </Suspense>
  );
}
