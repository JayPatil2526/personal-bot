"use client";

import { motion } from "framer-motion";
import { Check, Handshake, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Avatar, Card, Empty, PageHeader, ProgressRing, Segmented, Skeleton, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import type { Promise_ } from "@/lib/types";
import { cn, dueLabel, timeAgo } from "@/lib/utils";

interface PromisesRes {
  items: Promise_[];
  kept: number;
  broken: number;
  pending: number;
  kept_rate: number | null;
}

const STATUS_STYLE = {
  pending: "border-line bg-white",
  kept: "border-sage-line bg-sage-soft",
  broken: "border-line bg-subtle",
};

export default function PromisesPage() {
  const [data, setData] = useState<PromisesRes | null>(null);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const load = useCallback(() => api<PromisesRes>("/promises").then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  const set = async (id: number, status: Promise_["status"]) => {
    await api(`/promises/${id}`, { method: "PATCH", json: { status } });
    load();
  };
  const remove = async (id: number) => {
    await api(`/promises/${id}`, { method: "DELETE" });
    load();
  };

  const items = (data?.items || []).filter((p) => (filter === "all" ? true : filter === "open" ? p.status === "pending" : p.status !== "pending"));
  const keptPct = data?.kept_rate != null ? data.kept_rate * 100 : 0;

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <PageHeader
        eyebrow="Promises"
        title="Things you said you'd do"
        subtitle="When you commit to something in chat — “I'll go for a walk tonight” — it's saved here with a date. When it's due, any crew member will ask how it went."
      />

      {!data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="flex items-center justify-between p-5">
              <div>
                <div className="text-[13px] text-muted">Kept rate</div>
                <div className="mt-1.5 text-[30px] font-medium leading-none tracking-tight tabular-nums">{data.kept_rate != null ? `${Math.round(keptPct)}%` : "—"}</div>
                <div className="mt-2 text-[12px] text-muted">of resolved promises</div>
              </div>
              <ProgressRing value={keptPct} size={54} stroke={5} color="#4d7c2a" />
            </Card>
            <Stat label="Open" value={data.pending} sub="waiting for follow-up" />
            <Stat label="Kept" value={data.kept} sub="you followed through" />
            <Stat label="Missed" value={data.broken} sub="no judgement — retry" />
          </div>

          <div className="mb-5">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "open", label: "Open" },
                { value: "resolved", label: "Resolved" },
                { value: "all", label: "All" },
              ]}
            />
          </div>

          {items.length ? (
            <div className="space-y-2">
              {items.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn("group flex items-center gap-4 rounded-2xl border px-4 py-3.5", STATUS_STYLE[p.status])}
                >
                  {p.character ? <Avatar name={p.character.name} color={p.character.color} size="sm" /> : <Avatar name="Crew" color="crew" size="sm" />}
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-[15px]", p.status === "broken" ? "text-muted line-through" : "text-ink")}>{p.text}</div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {p.status === "pending" ? (
                        <span className={p.days_left < 0 ? "text-rose" : p.days_left === 0 ? "text-saffron" : ""}>{dueLabel(p.days_left)}</span>
                      ) : (
                        <span>
                          {p.status === "kept" ? "kept" : "missed"} · {new Date(p.due_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                        </span>
                      )}
                      {p.character && ` · told ${p.character.name}`}
                      {p.followed_up && " · followed up"}
                      {` · made ${timeAgo(p.created_at)}`}
                    </div>
                  </div>
                  {p.status === "pending" ? (
                    <div className="flex gap-1.5">
                      <button onClick={() => set(p.id, "kept")} className="flex items-center gap-1 rounded-full border border-sage-line bg-sage-soft px-3 py-1 text-[12px] text-sage hover:bg-[#e3efd6]">
                        <Check className="h-3.5 w-3.5" /> Did it
                      </button>
                      <button onClick={() => set(p.id, "broken")} className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-[12px] text-ink-2 hover:bg-subtle">
                        <X className="h-3.5 w-3.5" /> Missed
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => set(p.id, "pending")} title="Reopen" className="rounded-full p-1.5 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-white hover:text-ink">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => remove(p.id)} title="Delete" className="rounded-full p-1.5 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-white hover:text-rose">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <Card>
              <Empty
                icon={<Handshake className="h-5 w-5" />}
                title={filter === "open" ? "No open promises" : "Nothing here yet"}
                text="Promises are captured automatically from chat. Try telling Arjun: “I'll go to the gym tomorrow morning, promise.”"
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
