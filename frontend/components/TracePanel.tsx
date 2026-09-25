"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { MemoryItem, Step } from "@/lib/types";
import { NODE_META, cn } from "@/lib/utils";

export function StepList({ steps, title }: { steps: Step[]; title: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...steps.map((s) => s.ms || 0));
  if (!steps.length) return null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">{title}</span>
        <span className="font-mono text-[11px] text-muted tabular-nums">{(steps.reduce((a, s) => a + (s.ms || 0), 0) / 1000).toFixed(2)}s</span>
      </div>
      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {steps.map((s) => {
            const meta = NODE_META[s.node] || { icon: Activity, color: "#8b8e9c" };
            const Icon = meta.icon;
            const tokens = (s.input_tokens || 0) + (s.output_tokens || 0);
            const expandable = !!(s.note || s.detail);
            return (
              <motion.div key={s.node} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                <button
                  onClick={() => expandable && setOpen(open === s.node ? null : s.node)}
                  className="w-full rounded-xl border border-line bg-white px-3 py-2 text-left transition-colors hover:border-line-strong"
                >
                  <div className="flex items-center gap-2 text-[12px]">
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: s.status === "error" ? "#cf3d5a" : meta.color }} />
                    <span className="font-mono text-ink">{s.node}</span>
                    {s.status === "running" ? (
                      <span className="ml-auto h-3 w-3 animate-spin rounded-full border border-line-strong border-t-ink" />
                    ) : (
                      <span className="ml-auto font-mono text-[11px] text-muted tabular-nums">{Math.round(s.ms || 0)}ms</span>
                    )}
                    {expandable && <ChevronDown className={cn("h-3 w-3 text-muted transition", open === s.node && "rotate-180")} />}
                  </div>
                  {s.status !== "running" && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-subtle">
                      <motion.div className="h-full rounded-full" style={{ background: meta.color }} initial={{ width: 0 }} animate={{ width: `${Math.max(2, ((s.ms || 0) / max) * 100)}%` }} />
                    </div>
                  )}
                  {(tokens > 0 || (s.providers?.length ?? 0) > 0) && (
                    <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[10px] text-muted">
                      {tokens > 0 && (
                        <span className="tabular-nums">
                          {s.input_tokens} → {s.output_tokens} tok
                        </span>
                      )}
                      {s.providers?.map((p) => (
                        <span key={p} className={p.startsWith("gemini") ? "text-indigo" : "text-saffron"}>
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                  <AnimatePresence>
                    {open === s.node && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        {s.note && <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{s.note}</p>}
                        {s.detail != null && (
                          <pre className="scroll-thin mt-2 max-h-56 overflow-auto rounded-lg bg-subtle p-2 font-mono text-[10px] leading-relaxed text-ink-2">
                            {JSON.stringify(s.detail, null, 2)}
                          </pre>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function RetrievedMemories({ items }: { items: MemoryItem[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="eyebrow mb-2">Retrieved memories</div>
      <div className="space-y-1.5">
        {items.map((m) => (
          <div key={`${m.type}-${m.id}`} className="rounded-xl border border-line bg-white p-2.5">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="rounded-full bg-indigo-soft px-2 py-0.5 text-indigo">{m.type}</span>
              <span className="ml-auto font-mono text-ink tabular-nums">{m.score.toFixed(3)}</span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{m.text}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-2 font-mono text-[10px] text-muted tabular-nums">
              {m.distance !== null && <span>cos {(1 - m.distance).toFixed(2)}</span>}
              {m.rerank !== null && <span>rerank {m.rerank.toFixed(2)}</span>}
              <span>imp {m.importance}</span>
              <span>rec {m.recency.toFixed(2)}</span>
              {m.keyword_bonus > 0 && <span>kw +{m.keyword_bonus}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
