"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryIcon } from "@/components/goals";
import { Avatar, Button, Card, PageHeader, ProgressBar, Skeleton, Stat, chartTooltip, fadeUp } from "@/components/ui";
import { api } from "@/lib/api";
import type { Character, WeeklyReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function InsightsPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setRefreshing(refresh);
    try {
      setReport(await api<WeeklyReport>(`/insights/weekly${refresh ? "?refresh=true" : ""}`));
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    load();
    api<Character[]>("/characters").then(setCharacters).catch(() => {});
  }, [load]);

  if (!report) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6 md:p-10">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-40" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <p className="text-center text-sm text-muted">Crunching your week…</p>
      </div>
    );
  }

  const s = report.stats;
  const n = report.narrative;
  const change = s.completion.change;
  const colorOfName = (name: string) => characters.find((c) => c.name === name)?.color || "crew";
  const moodLink =
    s.mood.todos_on_good_days != null && s.mood.todos_on_low_days != null
      ? `${s.mood.todos_on_good_days} habits on good-mood days vs ${s.mood.todos_on_low_days} on low-mood days`
      : "Not enough mood data yet";

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <PageHeader
        eyebrow={`Weekly report · ${fmt(report.period_start)} – ${fmt(report.period_end)}`}
        title={n.headline || "Your week"}
        subtitle="Every number below is computed from your own habits, moods and promises. The AI only writes the story around them."
        action={
          <Button variant="secondary" onClick={() => load(true)} loading={refreshing}>
            {!refreshing && <RefreshCw className="h-4 w-4" />} Regenerate
          </Button>
        }
      />

      {n.summary && (
        <motion.div initial="hidden" animate="show" variants={fadeUp}>
          <Card className="dots mb-6 p-6 md:p-8">
            <p className="max-w-3xl text-[19px] leading-relaxed tracking-tight text-ink">{n.summary}</p>
            {n.focus_next_week && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-1.5 text-[13px] text-ink-2">
                <span className="font-medium text-ink">Next week:</span> {n.focus_next_week}
              </div>
            )}
          </Card>
        </motion.div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Habits completed"
          value={pct(s.completion.this_week)}
          sub={
            change != null ? (
              <span className={cn("inline-flex items-center gap-0.5", change >= 0 ? "text-sage" : "text-rose")}>
                {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {Math.abs(Math.round(change * 100))} pts vs last week ({pct(s.completion.last_week)})
              </span>
            ) : (
              "no data for last week"
            )
          }
        />
        <Stat label="Promises kept" value={pct(s.promises.kept_rate)} sub={`${s.promises.kept} kept · ${s.promises.broken} missed · ${s.promises.pending} open`} />
        <Stat label="Average mood" value={s.mood.average != null ? `${s.mood.average}/10` : "—"} sub={s.mood.top.map(([m]) => m).join(", ") || "no mood data"} />
        <Stat label="Best day" value={s.best_weekday || "—"} sub={`current streak ${s.streaks.best_current} days`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-[16px] font-medium">Day by day</h2>
            <p className="text-[13px] text-muted">Share of planned daily habits completed · today is still in progress</p>
            <div className="mt-5 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.days.map((d) => ({ ...d, value: d.rate != null ? Math.round(d.rate * 100) : d.planned ? Math.round((d.done / d.planned) * 100) : 0 }))}>
                  <XAxis dataKey="label" tick={{ fill: "#8b8e9c", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip {...chartTooltip} formatter={(v, _n, p) => [`${v}% (${p.payload?.done}/${p.payload?.planned})${p.payload?.partial ? " · in progress" : ""}`, "completed"]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {s.days.map((d) => (
                      <Cell key={d.day} fill={d.partial ? "#d6d7df" : "#1e2033"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-[16px] font-medium">Goals this week</h2>
            <div className="space-y-4">
              {s.goals.map((g) => (
                <div key={g.id} className="flex items-center gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-subtle">
                    <CategoryIcon category={g.category} className="text-ink-2" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 text-[14px]">
                      <span className="truncate text-ink">{g.title}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {g.week_done}/{g.week_planned}
                      </span>
                    </div>
                    <ProgressBar value={g.week_rate * 100} className="mt-1.5" color="#4d7c2a" />
                  </div>
                </div>
              ))}
              {!s.goals.length && <p className="text-sm text-muted">No active goals.</p>}
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <div className="eyebrow mb-3">Wins</div>
              <ul className="space-y-2.5">
                {n.wins.map((w) => (
                  <li key={w} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" /> {w}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-6">
              <div className="eyebrow mb-3">Struggles</div>
              <ul className="space-y-2.5">
                {n.struggles.map((w) => (
                  <li key={w} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-saffron" /> {w}
                  </li>
                ))}
                {!n.struggles.length && <li className="text-sm text-muted">Nothing notable.</li>}
              </ul>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="eyebrow mb-4">What your crew says</div>
            <div className="space-y-3">
              {n.crew.map((c) => (
                <div key={c.name} className="flex gap-3">
                  <Avatar name={c.name} color={colorOfName(c.name)} size="sm" />
                  <div className="rounded-2xl rounded-tl-md bg-subtle px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">
                    <div className="mb-0.5 text-[11px] font-medium text-muted">{c.name}</div>
                    {c.comment}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="eyebrow mb-3">Mood and habits</div>
            <div className="text-[15px] leading-relaxed text-ink">{moodLink}</div>
            <p className="mt-2 text-[13px] text-muted">
              Based on {s.mood.days_with_mood} days with mood data
              {s.mood.correlation != null && ` · correlation r = ${s.mood.correlation}`}
            </p>
          </Card>

          <Card className="p-6">
            <div className="eyebrow mb-3">Promises this week</div>
            <div className="space-y-2">
              {s.promises.items.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-[14px]">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", p.status === "kept" ? "bg-sage" : p.status === "broken" ? "bg-line-strong" : "bg-saffron")} />
                  <span className={cn("flex-1 truncate", p.status === "broken" ? "text-muted line-through" : "text-ink")}>{p.text}</span>
                  <span className="text-[12px] text-muted">{p.status}</span>
                </div>
              ))}
              {!s.promises.items.length && <p className="text-sm text-muted">No promises due this week.</p>}
            </div>
          </Card>

          <Card className="p-6">
            <div className="eyebrow mb-3">Memory this week</div>
            <div className="text-[14px] text-ink-2">
              {s.memory.episodes} new episodes · {s.memory.new_facts} new facts
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {s.memory.themes.map(([t, c]) => (
                <span key={t} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2">
                  {t} <span className="text-muted">{c}</span>
                </span>
              ))}
            </div>
            {s.conversations.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t border-line pt-4">
                {s.conversations.map((c) => (
                  <div key={c.character} className="flex justify-between text-[13px]">
                    <span className="text-ink-2">{c.character}</span>
                    <span className="tabular-nums text-muted">{c.messages} messages</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      <p className="mt-8 text-center text-[12px] text-muted">Generated {new Date(report.generated_at).toLocaleString()}</p>
    </div>
  );
}
