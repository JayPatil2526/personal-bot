"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, Trash2 } from "lucide-react";
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
        title={
          <>
            What your crew <span className="italic text-gradient">remembers</span>
          </>
        }
        subtitle="Episodic memories (what happened & how it felt), semantic facts, and notes your characters share with each other."
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "timeline", label: `Timeline ${episodes ? `· ${episodes.length}` : ""}` },
            { value: "facts", label: `Facts ${facts ? `· ${facts.length}` : ""}` },
            { value: "crew", label: `Crew notes ${notes ? `· ${notes.length}` : ""}` },
            { value: "search", label: "🔍 Semantic search" },
          ]}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === "timeline" &&
            (!episodes ? (
              <Skeleton className="h-64" />
            ) : !episodes.length ? (
              <Card>
                <Empty icon="🧠" title="No memories yet" text="Chat with your crew — memories are written in the background after each conversation." />
              </Card>
            ) : (
              <div className="space-y-8">
                {byDay.map(([day, items]) => (
                  <div key={day}>
                    <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">{day}</div>
                    <div className="relative space-y-3 pl-6">
                      <div className="absolute bottom-2 left-[7px] top-2 w-px bg-gradient-to-b from-violet-400/40 to-transparent" />
                      {items.map((e, i) => (
                        <motion.div key={e.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="relative">
                          <span className={cn("absolute -left-6 top-4 h-3.5 w-3.5 rounded-full ring-4 ring-[#07070b]", e.kind === "reflection" ? "bg-pink-400" : "bg-violet-400")} />
                          <Card className="p-4">
                            <div className="flex items-start gap-3">
                              {e.character ? <Avatar emoji={e.character.avatar} color={e.character.color} size="sm" /> : <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-pink-500/15 text-base">🪞</div>}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm leading-relaxed text-white">{e.summary}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                                  <span>{e.kind === "reflection" ? "Weekly reflection" : `with ${e.character?.name}`}</span>
                                  <span>·</span>
                                  <span>{new Date(e.when).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                                  <Badge className="border-white/10 bg-white/5 text-soft">{e.emotion}</Badge>
                                  <span className="flex gap-0.5" title={`importance ${e.importance}/10`}>
                                    {Array.from({ length: 10 }).map((_, j) => (
                                      <span key={j} className={cn("h-1.5 w-1.5 rounded-full", j < e.importance ? "bg-fuchsia-400" : "bg-white/10")} />
                                    ))}
                                  </span>
                                  {e.keywords?.slice(0, 4).map((k) => (
                                    <span key={k} className="rounded bg-white/[0.04] px-1.5 py-0.5">#{k}</span>
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
                <Empty icon="📌" title="No facts yet" text="Durable facts & preferences are extracted and de-duplicated automatically." />
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {byCategory.map(([cat, items]) => (
                  <Card key={cat} className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium capitalize text-white">{cat}</span>
                      <span className="text-xs text-muted">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.map((f) => (
                        <div key={f.id} className="group flex items-start gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5">
                          <span className="mt-0.5 text-xs">{f.kind === "preference" ? "💜" : "📌"}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-soft">{f.fact}</p>
                            <p className="mt-0.5 text-[10px] text-muted">
                              {Math.round(f.confidence * 100)}% confident · {timeAgo(f.updated_at)}
                              {f.times_updated > 0 && ` · updated ${f.times_updated}×`}
                            </p>
                          </div>
                          <button onClick={() => deleteFact(f.id)} className="hidden text-muted hover:text-rose-300 group-hover:block" title="Forget">
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
                <Empty icon="🤝" title="No crew notes yet" text="When something notable happens, a character leaves a note so the others know too." />
              </Card>
            ) : (
              <div className="space-y-3">
                {notes.map((n, i) => (
                  <motion.div key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Card className="flex items-start gap-3 p-4">
                      <Avatar emoji={n.character.avatar} color={n.character.color} size="sm" />
                      <div>
                        <p className="text-sm text-white">{n.note}</p>
                        <p className="mt-1 text-[11px] text-muted">
                          {n.character.name} → shared with the crew · {timeAgo(n.when)}
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
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. how do I feel about work?  ·  water  ·  money" className="pl-10" />
                </div>
                <button
                  type="button"
                  onClick={() => setRerank(!rerank)}
                  className={cn("rounded-xl border px-3 text-xs transition", rerank ? "border-violet-400/30 bg-violet-400/10 text-violet-200" : "border-white/10 text-muted")}
                >
                  Reranker {rerank ? "ON" : "OFF"}
                </button>
                <Button type="submit" loading={searching}>
                  Search
                </Button>
              </form>
              {res && (
                <div className="mt-6">
                  <p className="mb-3 text-xs text-muted">
                    {res.candidates} candidates from pgvector (cosine, HNSW) → {res.used_reranker ? "cross-encoder reranked" : "no rerank"} → top{" "}
                    {res.results.length} by 0.6·relevance + 0.25·importance + 0.15·recency
                  </p>
                  <div className="space-y-2">
                    {res.results.map((m, i) => (
                      <motion.div key={`${m.type}-${m.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                        <Card className="p-4">
                          <div className="flex items-start gap-4">
                            <div className="w-14 shrink-0 text-center">
                              <div className="font-mono text-lg font-semibold text-gradient">{m.score.toFixed(2)}</div>
                              <div className="text-[9px] uppercase tracking-wider text-muted">score</div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Badge className="border-violet-400/25 bg-violet-400/10 text-violet-200">{m.type}</Badge>
                                <span className="text-[11px] text-muted">{timeAgo(m.when)}</span>
                              </div>
                              <p className="mt-1.5 text-sm text-white">{m.text}</p>
                              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                {[
                                  ["cosine", m.distance !== null ? 1 - m.distance : null],
                                  ["rerank", m.rerank],
                                  ["importance", m.importance / 10],
                                  ["recency", m.recency],
                                  ["relevance", m.relevance],
                                ].map(([label, val]) => (
                                  <div key={label as string}>
                                    <div className="flex justify-between text-[10px] text-muted">
                                      <span>{label}</span>
                                      <span className="font-mono">{val === null ? "—" : (val as number).toFixed(2)}</span>
                                    </div>
                                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                                      <motion.div className="h-full rounded-full btn-gradient" initial={{ width: 0 }} animate={{ width: `${((val as number) || 0) * 100}%` }} />
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
