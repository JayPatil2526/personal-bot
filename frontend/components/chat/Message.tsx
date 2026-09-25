"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, ExternalLink, ShieldAlert } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { PriorityBadge } from "@/components/goals";
import { Avatar } from "@/components/ui";
import type { Character, ChatMessage, Chip, Step } from "@/lib/types";
import { CATEGORY_EMOJI, NODE_META, cn } from "@/lib/utils";

const CHIP_STYLE: Record<string, string> = {
  goal: "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200",
  memory: "border-violet-400/25 bg-violet-400/10 text-violet-200",
  web: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  progress: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  safety: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  crew: "border-amber-400/25 bg-amber-400/10 text-amber-200",
};

export function Chips({ chips }: { chips: Chip[] }) {
  if (!chips?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <AnimatePresence>
        {chips.map((c, i) => (
          <motion.span
            key={c.text + i}
            initial={{ opacity: 0, scale: 0.85, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 400, damping: 24 }}
            className={cn("rounded-full border px-2.5 py-1 text-[11px]", CHIP_STYLE[c.type] || CHIP_STYLE.memory)}
          >
            {c.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function LiveSteps({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      <AnimatePresence>
        {steps.map((s) => (
          <motion.span
            key={s.node}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]",
              s.status === "running" ? "border-white/15 bg-white/[0.06] text-white" : "border-white/[0.06] bg-white/[0.02] text-muted",
              s.status === "error" && "border-rose-400/30 text-rose-300",
            )}
          >
            <span>{NODE_META[s.node]?.icon || "•"}</span>
            {s.label}
            {s.status === "running" ? (
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-white/30 border-t-white" />
            ) : (
              <span className="font-mono text-[10px] opacity-70">{((s.ms || 0) / 1000).toFixed(1)}s</span>
            )}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

function GoalCardInline({ card }: { card: NonNullable<ChatMessage["meta"]["cards"]>[number] }) {
  if (card.type === "refused") {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/[0.06] p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
        <div>
          <div className="text-sm font-medium text-rose-200">Goal not created</div>
          <p className="mt-0.5 text-xs text-rose-200/70">{card.validation?.reason}</p>
        </div>
      </div>
    );
  }
  const g = card.goal!;
  const v = card.validation;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/[0.12] via-fuchsia-500/[0.06] to-transparent"
    >
      <div className="p-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
          <span>{v?.tier === "reframe" ? "🔁 Reframed goal" : "🎯 New goal"}</span>
          <span className="ml-auto">feasibility {Math.round((v?.feasibility ?? 1) * 100)}%</span>
        </div>
        <Link href={`/goals/${g.id}`} className="mt-1.5 flex items-center gap-2 text-lg font-semibold text-white hover:underline">
          <span>{CATEGORY_EMOJI[g.category] || "✨"}</span> {g.title}
        </Link>
        {g.original_request && v?.tier === "reframe" && (
          <p className="mt-1 text-xs text-muted">
            You asked: <span className="line-through">{g.original_request}</span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <PriorityBadge priority={g.priority} />
          {g.deadline && <span>by {new Date(g.deadline).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
        </div>
      </div>
      <div className="grid gap-px border-t border-white/[0.06] bg-white/[0.04] sm:grid-cols-2">
        <div className="bg-[#0d0d14]/80 p-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Milestones</div>
          <ol className="space-y-1.5">
            {g.milestones?.map((m, i) => (
              <li key={m.id} className="flex gap-2 text-xs text-soft">
                <span className="font-mono text-muted">{i + 1}.</span> {m.title}
              </li>
            ))}
          </ol>
        </div>
        <div className="bg-[#0d0d14]/80 p-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Daily plan</div>
          <ul className="space-y-1.5">
            {g.todos?.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-xs text-soft">
                <span className="h-3 w-3 shrink-0 rounded border border-white/25" /> {t.title}
                <span className="ml-auto text-[10px] text-muted">{t.recurrence}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

export function Sources({ sources }: { sources: ChatMessage["meta"]["sources"] }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
      {sources.slice(0, 4).map((s, i) => (
        <a
          key={s.url + i}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="group flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 transition hover:border-sky-400/30"
        >
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-sky-400/15 font-mono text-[9px] text-sky-200">
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="line-clamp-1 text-xs text-white group-hover:text-sky-200">{s.title}</span>
            <span className="line-clamp-1 text-[10px] text-muted">{new URL(s.url).hostname}</span>
          </span>
          <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted" />
        </a>
      ))}
    </div>
  );
}

export function MessageBubble({
  message,
  character,
  streaming,
  liveSteps,
  onTrace,
  selected,
}: {
  message: Pick<ChatMessage, "role" | "content" | "meta"> & { id?: number };
  character: Character;
  streaming?: boolean;
  liveSteps?: Step[];
  onTrace?: () => void;
  selected?: boolean;
}) {
  if (message.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-gradient-to-br from-violet-600/80 to-fuchsia-600/70 px-4 py-2.5 text-[14.5px] leading-relaxed text-white shadow-lg shadow-fuchsia-900/20">
          {message.content}
        </div>
      </motion.div>
    );
  }
  const meta = message.meta || {};
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <Avatar emoji={character.avatar} color={character.color} size="sm" className="mt-1" />
      <div className="min-w-0 max-w-[85%] flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="font-medium text-white">{character.name}</span>
          {onTrace && !streaming && (
            <button
              onClick={onTrace}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition",
                selected ? "bg-violet-500/20 text-violet-200" : "text-muted hover:bg-white/5 hover:text-soft",
              )}
            >
              <Activity className="h-3 w-3" /> trace
            </button>
          )}
        </div>
        {liveSteps && <LiveSteps steps={liveSteps} />}
        {(message.content || streaming) && (
          <div
            className={cn(
              "prose-chat inline-block rounded-3xl rounded-tl-lg border border-white/[0.07] bg-white/[0.04] px-4 py-2.5 text-[14.5px] leading-relaxed text-soft",
              streaming && "caret",
            )}
          >
            {message.content ? <ReactMarkdown>{message.content}</ReactMarkdown> : <span className="text-muted">thinking…</span>}
          </div>
        )}
        <Chips chips={meta.chips || []} />
        {meta.cards?.map((c, i) => <GoalCardInline key={i} card={c} />)}
        <Sources sources={meta.sources} />
        <Chips chips={meta.memory_chips || []} />
      </div>
    </motion.div>
  );
}
