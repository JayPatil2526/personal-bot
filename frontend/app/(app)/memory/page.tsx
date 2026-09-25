"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Brain, NotebookPen, Search, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, Badge, Button, Card, Empty, Input, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { MemoryItem } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

interface Episode {
  id: number;
  summary: string;
  emotion: string;
  importance: number;
  kind: string;
  keywords: string[];
  when: string;
  character: { name: string; avatar: string; color: string } | null;
}
interface Fact {
  id: number;
  fact: string;
  category: string;
  kind: string;
  confidence: number;
  times_updated: number;
  updated_at: string;
}
interface Note {
  id: number;
  note: string;
  when: string;
  character: { name: string; avatar: string; color: string };
}
interface SearchRes {
  query: string;
  used_vector: boolean;
  used_reranker: boolean;
  candidates: number;
  results: MemoryItem[];
}

type Tab = "timeline" | "facts" | "crew" | "search";

export default function MemoryPage() {
  const [tab, setTab] = useState<Tab>("timeline");
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [q, setQ] = useState("");
  const [rerank, setRerank] = useState(true);
  const [res, setRes] = useState<SearchRes | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api<Episode[]>("/memory/episodes").then(setEpisodes).catch(() => {});
    api<Fact[]>("/memory/facts").then(setFacts).catch(() => {});
    api<Note[]>("/memory/notes").then(setNotes).catch(() => {});
  }, []);

  const byDay = useMemo(() => {
    const groups: Record<string, Episode[]> = {};
    for (const e of episodes || []) {
      const d = new Date(e.when).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      (groups[d] ||= []).push(e);
    }
    return Object.entries(groups);
  }, [episodes]);

  const byCategory = useMemo(() => {
    const groups: Record<string, Fact[]> = {};
    for (const f of facts || []) (groups[f.category] ||= []).push(f);
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [facts]);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      setRes(await api<SearchRes>(`/memory/search?q=${encodeURIComponent(q)}&rerank=${rerank}`));
    } finally {
      setSearching(false);
    }
  };

  const deleteFact = async (id: number) => {
    await api(`/memory/facts/${id}`, { method: "DELETE" });
    setFacts((f) => f?.filter((x) => x.id !== id) || null);
    toast.success("Forgotten.");
  };

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <PageHeader
        eyebrow="Memory"
        title="What your crew remembers"
        subtitle="Episodes (what happened and how it felt), facts about you, and notes your characters share with each other. You can search it — and delete anything."
      />
      <div className="mb-6">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "timeline", label: `Timeline${episodes ? ` · ${episodes.length}` : ""}` },
            { value: "facts", label: `Facts${facts ? ` · ${facts.length}` : ""}` },
            { value: "crew", label: `Crew notes${notes ? ` · ${notes.length}` : ""}` },
            { value: "search", label: "Search" },
          ]}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === "timeline" &&
            (!episodes ? (
              <Skeleton className="h-64" />
            ) : !episodes.length ? (
              <Card>
                <Empty icon={<Brain className="h-5 w-5" />} title="No memories yet" text="Chat with your crew — memories are written in the background after each conversation." />
              </Card>
            ) : (
              <div className="space-y-10">
                {byDay.map(([day, items]) => (
                  <div key={day}>
                    <div className="eyebrow mb-4">{day}</div>
                    <div className="relative space-y-3 border-l border-line pl-6">
                      {items.map((e, i) => (
                        <motion.div key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="relative">
                          <span className={cn("absolute -left-[29px] top-5 h-2.5 w-2.5 rounded-full ring-4 ring-bg", e.kind === "reflection" ? "bg-saffron" : "bg-ink")} />
                          <Card className="p-4">
                            <div className="flex items-start gap-3">
                              {e.character ? <Avatar name={e.character.name} color={e.character.color} size="sm" /> : <Avatar name="Reflection" color="saffron" size="sm" />}
                              <div className="min-w-0 flex-1">
                                <p className="text-[15px] leading-relaxed text-ink">{e.summary}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                                  <span>{e.kind === "reflection" ? "Weekly reflection" : `with ${e.character?.name}`}</span>
                                  <span>·</span>
                                  <span>{new Date(e.when).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                                  <Badge className="border-line bg-subtle text-ink-2">{e.emotion}</Badge>
                                  <span className="flex gap-0.5" title={`importance ${e.importance}/10`}>
                                    {Array.from({ length: 10 }).map((_, j) => (
                                      <span key={j} className={cn("h-1.5 w-1.5 rounded-full", j < e.importance ? "bg-ink" : "bg-line")} />
                                    ))}
                                  </span>
                                  {e.keywords?.slice(0, 4).map((k) => (
                                    <span key={k} className="text-ink-2">
                                      #{k}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {tab === "facts" &&
            (!facts ? (
              <Skeleton className="h-64" />
            ) : !facts.length ? (
              <Card>
                <Empty icon={<NotebookPen className="h-5 w-5" />} title="No facts yet" text="Durable facts and preferences are extracted and de-duplicated automatically." />
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {byCategory.map(([cat, items]) => (
                  <Card key={cat} className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[14px] font-medium capitalize text-ink">{cat}</span>
                      <span className="text-[12px] text-muted">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((f) => (
                        <div key={f.id} className="group flex items-start gap-2 rounded-xl bg-subtle p-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] text-ink">{f.fact}</p>
                            <p className="mt-0.5 text-[11px] text-muted">
                              {f.kind} · {Math.round(f.confidence * 100)}% confident · {timeAgo(f.updated_at)}
                              {f.times_updated > 0 && ` · updated ${f.times_updated}×`}
                            </p>
                          </div>
                          <button onClick={() => deleteFact(f.id)} className="rounded-full p-1 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-white hover:text-rose" title="Forget">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            ))}

          {tab === "crew" &&
            (!notes ? (
              <Skeleton className="h-64" />
            ) : !notes.length ? (
              <Card>
                <Empty icon={<Users className="h-5 w-5" />} title="No crew notes yet" text="When something notable happens, a character leaves a note so the others know too." />
              </Card>
            ) : (
              <div className="space-y-2">
                {notes.map((n, i) => (
                  <motion.div key={n.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                    <Card className="flex items-start gap-3 p-4">
                      <Avatar name={n.character.name} color={n.character.color} size="sm" />
                      <div>
                        <p className="text-[15px] text-ink">{n.note}</p>
                        <p className="mt-1 text-[12px] text-muted">
                          {n.character.name} shared with the crew · {timeAgo(n.when)}
                        </p>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ))}

          {tab === "search" && (
            <div>
              <form onSubmit={search} className="flex flex-wrap gap-2">
                <div className="relative min-w-[240px] flex-1">
                  <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try: work stress · water · money" className="pl-10" />
                </div>
                <button
                  type="button"
                  onClick={() => setRerank(!rerank)}
                  className={cn("rounded-full border px-4 text-[13px] transition-colors", rerank ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2")}
                >
                  Reranker {rerank ? "on" : "off"}
                </button>
                <Button type="submit" loading={searching}>
                  Search
                </Button>
              </form>
              {res && (
                <div className="mt-6">
                  <p className="mb-4 text-[13px] text-muted">
                    {res.candidates} candidates from pgvector (cosine, HNSW) → {res.used_reranker ? "cross-encoder reranked" : "no rerank"} → top {res.results.length} by
                    0.6·relevance + 0.25·importance + 0.15·recency
                  </p>
                  <div className="space-y-2">
                    {res.results.map((m, i) => (
                      <motion.div key={`${m.type}-${m.id}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                        <Card className="p-4">
                          <div className="flex items-start gap-4">
                            <div className="w-14 shrink-0 text-center">
                              <div className="font-mono text-[18px] font-medium tabular-nums text-ink">{m.score.toFixed(2)}</div>
                              <div className="text-[10px] text-muted">score</div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Badge className="border-indigo-line bg-indigo-soft text-indigo">{m.type}</Badge>
                                <span className="text-[12px] text-muted">{timeAgo(m.when)}</span>
                              </div>
                              <p className="mt-1.5 text-[15px] text-ink">{m.text}</p>
                              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                                {(
                                  [
                                    ["cosine", m.distance !== null ? 1 - m.distance : null],
                                    ["rerank", m.rerank],
                                    ["importance", m.importance / 10],
                                    ["recency", m.recency],
                                    ["relevance", m.relevance],
                                  ] as [string, number | null][]
                                ).map(([label, val]) => (
                                  <div key={label}>
                                    <div className="flex justify-between text-[11px] text-muted">
                                      <span>{label}</span>
                                      <span className="font-mono tabular-nums">{val === null ? "—" : val.toFixed(2)}</span>
                                    </div>
                                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#ececf1]">
                                      <motion.div className="h-full rounded-full bg-ink" initial={{ width: 0 }} animate={{ width: `${(val || 0) * 100}%` }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                    {!res.results.length && <p className="py-8 text-center text-sm text-muted">No related memories found.</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
