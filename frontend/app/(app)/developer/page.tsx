"use client";

import { Background, Controls, type Edge, MarkerType, type Node, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RetrievedMemories, StepList } from "@/components/TracePanel";
import { Badge, Card, PageHeader, Segmented, Skeleton } from "@/components/ui";
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
}
interface Stats {
  turns: number;
  avg_turn_ms: number;
  avg_tokens_per_turn: number;
  fallback_calls: number;
  nodes: { node: string; calls: number; avg_ms: number; tokens: number }[];
}

const FG_POS: Record<string, [number, number]> = {
  load_context: [300, 0], classify: [300, 90], safety_guard: [300, 180], progress_update: [20, 300], goal_validator: [230, 300],
  web_search: [470, 330], goal_planner: [230, 420], memory_retrieval: [300, 530], responder: [300, 620], post_process: [300, 710],
};
const BG_POS: Record<string, [number, number]> = {
  bg_input: [330, 0], job_router: [330, 100], extraction: [0, 230], compression: [130, 280], behaviour: [260, 230],
  adaptation: [400, 280], life_event: [530, 230], reflection: [660, 280],
};

function buildFlow(spec: { nodes: string[]; edges: [string, string][] }, pos: Record<string, [number, number]>, active: string[]) {
  const activeSet = new Set(active);
  const pairs = new Set(active.slice(0, -1).map((n, i) => `${n}>${active[i + 1]}`));
  const nodes: Node[] = spec.nodes.map((n) => {
    const meta = NODE_META[n] || { icon: "•", color: "#94a3b8" };
    const on = activeSet.has(n);
    return {
      id: n,
      position: { x: pos[n]?.[0] ?? 0, y: pos[n]?.[1] ?? 0 },
      data: { label: `${meta.icon}  ${n}` },
      style: {
        background: on ? `${meta.color}22` : "rgba(255,255,255,0.03)",
        border: `1px solid ${on ? meta.color : "rgba(255,255,255,0.1)"}`,
        color: on ? "#fff" : "#8b8b9e",
        borderRadius: 12,
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        padding: "8px 12px",
        width: 170,
        boxShadow: on ? `0 0 24px -6px ${meta.color}` : "none",
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
      style: { stroke: on ? "#e879f9" : "rgba(255,255,255,0.12)", strokeWidth: on ? 2 : 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: on ? "#e879f9" : "rgba(255,255,255,0.2)" },
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
        title={
          <>
            Under the <span className="italic text-gradient">hood</span>
          </>
        }
        subtitle="LangGraph agent graphs, per-node latency & tokens, provider fallback and memory retrieval scores — for every turn."
      />

      {/* Config + stats */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Chat turns", v: stats?.turns ?? "—" },
          { l: "Avg turn latency", v: stats ? `${(stats.avg_turn_ms / 1000).toFixed(1)}s` : "—" },
          { l: "Avg tokens / turn", v: stats?.avg_tokens_per_turn ?? "—" },
          { l: "Fallback calls", v: stats?.fallback_calls ?? "—" },
        ].map((x, i) => (
          <motion.div key={x.l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-5">
              <div className="text-xs text-muted">{x.l}</div>
              <div className="mt-1 font-mono text-2xl text-white">{x.v}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
            <div className="text-sm font-medium text-white">Agent graph</div>
            <Segmented
              value={which}
              onChange={setWhich}
              options={[
                { value: "foreground", label: "Foreground (per message)" },
                { value: "background", label: "Background (memory)" },
              ]}
            />
          </div>
          <div className="h-[560px]">
            {flow ? (
              <ReactFlow key={which} nodes={flow.nodes} edges={flow.edges} fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }} nodesDraggable colorMode="dark">
                <Background color="rgba(255,255,255,0.05)" gap={22} />
                <Controls showInteractive={false} />
              </ReactFlow>
            ) : (
              <Skeleton className="h-full rounded-none" />
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-3 text-sm font-medium text-white">Model stack</div>
            {config ? (
              <div className="space-y-2 font-mono text-[11px]">
                {[
                  ["reply", config.reply_model, "orange"],
                  ["fast (classify/extract)", config.fast_model, "orange"],
                  ["fallback", config.fallback_model, "sky"],
                  ["embeddings", `${config.embedding_model} · ${config.embedding_dim}d`, "violet"],
                  ["reranker", config.reranker, "emerald"],
                ].map(([k, v, c]) => (
                  <div key={k} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                    <span className="text-muted">{k}</span>
                    <span className={cn("truncate", { orange: "text-orange-300", sky: "text-sky-300", violet: "text-violet-300", emerald: "text-emerald-300" }[c as string])}>{v}</span>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-1">
                  {(["mistral", "gemini"] as const).map((p) => {
                    const configured = p === "mistral" ? config.mistral_configured : config.gemini_configured;
                    const open = config.provider_circuits?.[p] === "open";
                    const ok = configured && !open;
                    return (
                      <Badge key={p} className={ok ? "border-emerald-400/25 text-emerald-300" : "border-rose-400/25 text-rose-300"}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-rose-400")} />
                        {p} {!configured ? "· no key" : open ? "· circuit open (using fallback)" : "· healthy"}
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
            <div className="mb-3 text-sm font-medium text-white">Avg latency per node</div>
            <div className="h-56">
              {stats && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.nodes.slice(0, 10)} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="node" width={110} tick={{ fill: "#8b8b9e", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v) => [`${Math.round(Number(v))} ms`, "avg"]}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      contentStyle={{ background: "#14141d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="avg_ms" fill="#a78bfa" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Traces */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-medium text-white">Traces</div>
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
                className={cn(
                  "w-full rounded-xl border px-3 py-2.5 text-left transition",
                  selected?.id === t.id ? "border-violet-400/30 bg-violet-400/[0.07]" : "border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]",
                )}
              >
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="font-mono">#{t.id}</span>
                  <span>{timeAgo(t.created_at)}</span>
                  <span className="ml-auto font-mono">{(t.total_ms / 1000).toFixed(1)}s</span>
                  <span className="font-mono">{t.input_tokens + t.output_tokens} tok</span>
                </div>
                <div className="mt-1 truncate text-sm text-white">{t.user_message}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.route.map((r, i) => (
                    <span key={i} className="text-[11px]" title={r}>
                      {NODE_META[r]?.icon || "•"}
                    </span>
                  ))}
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
                <div className="text-sm font-medium text-white">Trace #{selected.id}</div>
                <p className="mt-1 text-xs text-muted">“{selected.user_message}”</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.providers.map((p) => (
                    <Badge key={p} className="border-white/10 bg-white/5 text-soft">
                      {p}
                    </Badge>
                  ))}
                  <Badge className="border-white/10 bg-white/5 text-soft">
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
