"use client";

import { Background, Controls, type Edge, MarkerType, type Node, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Activity } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RetrievedMemories, StepList } from "@/components/TracePanel";
import { Badge, Card, PageHeader, Segmented, Skeleton, Stat, chartTooltip } from "@/components/ui";
import { api } from "@/lib/api";
import type { Trace } from "@/lib/types";
import { NODE_META, cn, timeAgo } from "@/lib/utils";

interface GraphSpec {
  foreground: { nodes: string[]; edges: [string, string][] };
  background: { nodes: string[]; edges: [string, string][] };
}
interface DevConfig {
  reply_model: string;
  fast_model: string;
  fallback_model: string;
  embedding_model: string;
  embedding_dim: number;
  reranker: string;
  mistral_configured: boolean;
  gemini_configured: boolean;
  provider_circuits: Record<string, "open" | "closed">;
  key_counts?: Record<string, number>;
}
interface Stats {
  turns: number;
  avg_turn_ms: number;
  avg_tokens_per_turn: number;
  fallback_calls: number;
  nodes: { node: string; calls: number; avg_ms: number; tokens: number }[];
}

const FG_POS: Record<string, [number, number]> = {
  load_context: [320, 0], classify: [320, 90], safety_guard: [320, 180], progress_update: [0, 300], commitments: [190, 300],
  goal_validator: [380, 300], web_search: [570, 340], goal_planner: [380, 420], memory_retrieval: [320, 530],
  responder: [320, 620], post_process: [320, 710],
};
const BG_POS: Record<string, [number, number]> = {
  bg_input: [330, 0], job_router: [330, 100], extraction: [0, 230], compression: [130, 280], behaviour: [260, 230],
  adaptation: [400, 280], life_event: [530, 230], reflection: [660, 280],
};

function buildFlow(spec: { nodes: string[]; edges: [string, string][] }, pos: Record<string, [number, number]>, active: string[]) {
  const activeSet = new Set(active);
  const pairs = new Set(active.slice(0, -1).map((n, i) => `${n}>${active[i + 1]}`));
  const nodes: Node[] = spec.nodes.map((n) => {
    const on = activeSet.has(n);
    return {
      id: n,
      position: { x: pos[n]?.[0] ?? 0, y: pos[n]?.[1] ?? 0 },
      data: { label: n },
      style: {
        background: on ? "#1e2033" : "#ffffff",
        border: `1px solid ${on ? "#1e2033" : "#d6d7df"}`,
        color: on ? "#ffffff" : "#4a4d5e",
        borderRadius: 999,
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        padding: "7px 12px",
        width: 160,
        boxShadow: "none",
      },
    };
  });
  const edges: Edge[] = spec.edges.map(([a, b]) => {
    const on = pairs.has(`${a}>${b}`);
    return {
      id: `${a}-${b}`,
      source: a,
      target: b,
      animated: on,
      style: { stroke: on ? "#e8590c" : "#d6d7df", strokeWidth: on ? 2 : 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: on ? "#e8590c" : "#d6d7df" },
    };
  });
  return { nodes, edges };
}

export default function DeveloperPage() {
  const [spec, setSpec] = useState<GraphSpec | null>(null);
  const [config, setConfig] = useState<DevConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selected, setSelected] = useState<Trace | null>(null);
  const [which, setWhich] = useState<"foreground" | "background">("foreground");
  const [kind, setKind] = useState<"chat" | "background" | "goal_preview">("chat");

  useEffect(() => {
    api<GraphSpec>("/dev/graph").then(setSpec).catch(() => {});
    api<DevConfig>("/dev/config").then(setConfig).catch(() => {});
    api<Stats>("/dev/stats").then(setStats).catch(() => {});
  }, []);
  useEffect(() => {
    api<Trace[]>(`/dev/traces?kind=${kind}&limit=40`).then((t) => {
      setTraces(t);
      setSelected(t[0] || null);
      setWhich(kind === "background" ? "background" : "foreground");
    });
  }, [kind]);

  const flow = useMemo(() => {
    if (!spec) return null;
    const active = selected ? selected.route : [];
    return which === "foreground" ? buildFlow(spec.foreground, FG_POS, active) : buildFlow(spec.background, BG_POS, active);
  }, [spec, selected, which]);

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-10">
      <PageHeader
        eyebrow="Developer"
        title="How the agent works"
        subtitle="LangGraph agent graphs, per-node latency and tokens, provider fallback and memory retrieval scores — recorded for every turn."
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Chat turns" value={stats?.turns ?? "—"} />
        <Stat label="Avg turn latency" value={stats ? `${(stats.avg_turn_ms / 1000).toFixed(1)}s` : "—"} />
        <Stat label="Avg tokens / turn" value={stats?.avg_tokens_per_turn ?? "—"} />
        <Stat label="Fallback calls" value={stats?.fallback_calls ?? "—"} sub="served by the backup provider" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="text-[14px] font-medium">Agent graph {selected && <span className="font-normal text-muted">· highlighting trace #{selected.id}</span>}</div>
            <Segmented
              value={which}
              onChange={setWhich}
              options={[
                { value: "foreground", label: "Per message" },
                { value: "background", label: "Memory" },
              ]}
            />
          </div>
          <div className="dots h-[560px]">
            {flow ? (
              <ReactFlow key={which} nodes={flow.nodes} edges={flow.edges} fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }}>
                <Background color="transparent" />
                <Controls showInteractive={false} />
              </ReactFlow>
            ) : (
              <Skeleton className="h-full rounded-none" />
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-3 text-[14px] font-medium">Model stack</div>
            {config ? (
              <div className="space-y-1.5 font-mono text-[11px]">
                {[
                  ["reply", config.reply_model],
                  ["fast (classify / extract)", config.fast_model],
                  ["fallback", config.fallback_model],
                  ["embeddings", `${config.embedding_model} · ${config.embedding_dim}d`],
                  ["reranker", config.reranker],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-2.5 py-1.5">
                    <span className="text-muted">{k}</span>
                    <span className="truncate text-ink">{v}</span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-2 font-sans">
                  {(["mistral", "gemini"] as const).map((p) => {
                    const configured = p === "mistral" ? config.mistral_configured : config.gemini_configured;
                    const open = config.provider_circuits?.[p] === "open";
                    const ok = configured && !open;
                    const keys = config.key_counts?.[p] ?? 0;
                    return (
                      <Badge key={p} className={ok ? "border-sage-line bg-sage-soft text-sage" : "border-rose-line bg-rose-soft text-rose"}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-sage" : "bg-rose")} />
                        {p}
                        {keys > 1 && ` · ${keys} keys`} {!configured ? "· no key" : open ? "· circuit open, using fallback" : "· healthy"}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Skeleton className="h-40" />
            )}
          </Card>
          <Card className="p-5">
            <div className="mb-3 text-[14px] font-medium">Average latency per node</div>
            <div className="h-60">
              {stats && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.nodes.slice(0, 10)} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="node" width={115} tick={{ fill: "#4a4d5e", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartTooltip} formatter={(v) => [`${Math.round(Number(v))} ms`, "avg"]} />
                    <Bar dataKey="avg_ms" fill="#1e2033" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[14px] font-medium">Traces</div>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: "chat", label: "chat" },
                { value: "background", label: "memory" },
                { value: "goal_preview", label: "goal wizard" },
              ]}
            />
          </div>
          <div className="scroll-thin max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
            {traces.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelected(t);
                  setWhich(t.kind === "background" ? "background" : "foreground");
                }}
                className={cn("w-full rounded-xl border px-3 py-2.5 text-left transition-colors", selected?.id === t.id ? "border-ink bg-subtle" : "border-line bg-white hover:border-line-strong")}
              >
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="font-mono">#{t.id}</span>
                  <span>{timeAgo(t.created_at)}</span>
                  <span className="ml-auto font-mono tabular-nums">{(t.total_ms / 1000).toFixed(1)}s</span>
                  <span className="font-mono tabular-nums">{t.input_tokens + t.output_tokens} tok</span>
                </div>
                <div className="mt-1 truncate text-[14px] text-ink">{t.user_message}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.route.map((r, i) => {
                    const Icon = NODE_META[r]?.icon || Activity;
                    return <Icon key={i} className="h-3 w-3 text-muted" aria-label={r} />;
                  })}
                </div>
              </button>
            ))}
            {!traces.length && <p className="py-8 text-center text-sm text-muted">No traces yet — chat with your crew.</p>}
          </div>
        </Card>
        <Card className="space-y-6 p-5">
          {selected ? (
            <>
              <div>
                <div className="text-[14px] font-medium">Trace #{selected.id}</div>
                <p className="mt-1 text-[13px] text-ink-2">&ldquo;{selected.user_message}&rdquo;</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.providers.map((p) => (
                    <Badge key={p} className="border-line bg-subtle text-ink-2">
                      {p}
                    </Badge>
                  ))}
                  <Badge className="border-line bg-subtle text-ink-2">
                    {selected.input_tokens} in · {selected.output_tokens} out
                  </Badge>
                </div>
              </div>
              <StepList steps={selected.nodes} title="Executed nodes" />
              <RetrievedMemories items={selected.retrieved} />
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted">Select a trace.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
