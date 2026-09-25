"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { MemoryItem, Step } from "@/lib/types";
import { NODE_META, cn } from "@/lib/utils";

export function StepList({ steps, title }: { steps: Step[]; title: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...steps.map((s) => s.ms || 0));
  if (!steps.length) return null;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted">
        <span>{title}</span>
        <span className="font-mono normal-case">{(steps.reduce((a, s) => a + (s.ms || 0), 0) / 1000).toFixed(2)}s</span>
      </div>
      <div className="relative space-y-1.5 pl-3">
        <div className="absolute bottom-2 left-[5px] top-2 w-px bg-white/10" />
        <AnimatePresence initial={false}>
          {steps.map((s) => {
            const meta = NODE_META[s.node] || { icon: "•", color: "#94a3b8" };
            const tokens = (s.input_tokens || 0) + (s.output_tokens || 0);
            return (
              <motion.div key={s.node} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="relative">
                <span
                  className={cn("absolute -left-3 top-3 h-2.5 w-2.5 rounded-full ring-4 ring-[#0b0b11]", s.status === "running" && "animate-pulse")}
                  style={{ background: s.status === "error" ? "#f87171" : meta.color }}
                />
                <button
                  onClick={() => setOpen(open === s.node ? null : s.node)}
                  className="w-full rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-left transition hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span>{meta.icon}</span>
                    <span className="font-medium text-white">{s.node}</span>
                    {s.status === "running" ? (
                      <span className="ml-auto h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                    ) : (
                      <span className="ml-auto font-mono text-[10px] text-muted">{Math.round(s.ms || 0)}ms</span>
                    )}
                    {s.note || s.detail ? <ChevronDown className={cn("h-3 w-3 text-muted transition", open === s.node && "rotate-180")} /> : null}
                  </div>
                  {s.status !== "running" && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: meta.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(2, ((s.ms || 0) / max) * 100)}%` }}
                      />
                    </div>
                  )}
                  {(tokens > 0 || (s.providers?.length ?? 0) > 0) && (
                    <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[10px] text-muted">
                      {tokens > 0 && (
                        <span>
                          {s.input_tokens}→{s.output_tokens} tok
                        </span>
                      )}
                      {s.providers?.map((p) => (
                        <span key={p} className={p.startsWith("gemini") ? "text-sky-300/80" : "text-orange-300/80"}>
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                  <AnimatePresence>
                    {open === s.node && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        {s.note && <p className="mt-2 text-[11px] leading-relaxed text-soft">{s.note}</p>}
                        {s.detail != null && (
                          <pre className="scroll-thin mt-2 max-h-56 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-muted">
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
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Retrieved memories</div>
      <div className="space-y-1.5">
        {items.map((m) => (
          <div key={`${m.type}-${m.id}`} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="rounded bg-violet-400/15 px-1.5 py-0.5 text-violet-200">{m.type}</span>
              <span className="ml-auto font-mono text-fuchsia-200">score {m.score.toFixed(3)}</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-soft">{m.text}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-2 font-mono text-[9.5px] text-muted">
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
