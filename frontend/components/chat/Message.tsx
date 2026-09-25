"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, Brain, Check, ExternalLink, Globe, Handshake, type LucideIcon, ShieldAlert, ShieldCheck, Target, Users } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { CategoryIcon, PriorityBadge } from "@/components/goals";
import { Avatar } from "@/components/ui";
import type { ChatMessage, Chip, Step } from "@/lib/types";
import { NODE_META, cn, colorOf } from "@/lib/utils";

const CHIP: Record<string, { icon: LucideIcon; cls: string }> = {
  goal: { icon: Target, cls: "border-saffron-line bg-saffron-soft text-saffron" },
  memory: { icon: Brain, cls: "border-indigo-line bg-indigo-soft text-indigo" },
  web: { icon: Globe, cls: "border-indigo-line bg-indigo-soft text-indigo" },
  progress: { icon: Check, cls: "border-sage-line bg-sage-soft text-sage" },
  safety: { icon: ShieldCheck, cls: "border-rose-line bg-rose-soft text-rose" },
  crew: { icon: Users, cls: "border-line bg-subtle text-ink-2" },
  promise: { icon: Handshake, cls: "border-amber-line bg-amber-soft text-amber" },
};

/** Backend chip texts start with an emoji; the UI uses line icons instead. */
const clean = (t: string) => t.replace(/^[^\p{L}\p{N}]+/u, "");

export function Chips({ chips }: { chips: Chip[] }) {
  if (!chips?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <AnimatePresence>
        {chips.map((c, i) => {
          const meta = CHIP[c.type] || CHIP.memory;
          return (
            <motion.span
              key={c.text + i}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]", meta.cls)}
            >
              <meta.icon className="h-3 w-3" strokeWidth={2} />
              {clean(c.text)}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function LiveSteps({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      <AnimatePresence>
        {steps.map((s) => {
          const Icon = NODE_META[s.node]?.icon || Activity;
          return (
            <motion.span
              key={s.node}
              layout
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]",
                s.status === "running" ? "border-line-strong bg-white text-ink" : "border-line bg-subtle text-muted",
                s.status === "error" && "border-rose-line text-rose",
              )}
            >
              <Icon className="h-3 w-3" />
              {s.label}
              {s.status === "running" ? (
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-muted border-t-ink" />
              ) : (
                <span className="font-mono text-[10px] tabular-nums opacity-70">{((s.ms || 0) / 1000).toFixed(1)}s</span>
              )}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function GoalCardInline({ card }: { card: NonNullable<ChatMessage["meta"]["cards"]>[number] }) {
  if (card.type === "refused") {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-rose-line bg-rose-soft p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose" />
        <div>
          <div className="text-[14px] font-medium text-rose">Goal not created</div>
          <p className="mt-0.5 text-[13px] text-ink-2">{card.validation?.reason}</p>
        </div>
      </div>
    );
  }
  const g = card.goal!;
  const v = card.validation;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 overflow-hidden rounded-2xl border border-line bg-white">
      <div className="p-4">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <span className={cn("font-medium", v?.tier === "reframe" ? "text-amber" : "text-saffron")}>
            {v?.tier === "reframe" ? "Reframed goal" : "New goal"}
          </span>
          <span className="ml-auto font-mono tabular-nums">feasibility {Math.round((v?.feasibility ?? 1) * 100)}%</span>
        </div>
        <Link href={`/goals/${g.id}`} className="mt-1.5 flex items-center gap-2 text-[16px] font-medium text-ink hover:underline">
          <CategoryIcon category={g.category} /> {g.title}
        </Link>
        {g.original_request && v?.tier === "reframe" && (
          <p className="mt-1 text-[12px] text-muted">
            You asked: <span className="line-through">{g.original_request}</span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <PriorityBadge priority={g.priority} />
          {g.deadline && <span>by {new Date(g.deadline).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
        </div>
      </div>
      <div className="grid border-t border-line sm:grid-cols-2 sm:divide-x sm:divide-line">
        <div className="p-4">
          <div className="eyebrow mb-2">Milestones</div>
          <ol className="space-y-1.5">
            {g.milestones?.map((m, i) => (
              <li key={m.id} className="flex gap-2 text-[13px] text-ink-2">
                <span className="font-mono text-muted">{i + 1}</span> {m.title}
              </li>
            ))}
          </ol>
        </div>
        <div className="border-t border-line p-4 sm:border-t-0">
          <div className="eyebrow mb-2">Daily plan</div>
          <ul className="space-y-1.5">
            {g.todos?.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[13px] text-ink-2">
                <span className="h-3.5 w-3.5 shrink-0 rounded border border-line-strong" /> {t.title}
                <span className="ml-auto text-[11px] text-muted">{t.recurrence}</span>
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
      {sources.slice(0, 4).map((s, i) => {
        let host = "";
        try {
          host = new URL(s.url).hostname.replace("www.", "");
        } catch {}
        return (
          <a key={s.url + i} href={s.url} target="_blank" rel="noreferrer" className="group flex items-start gap-2 rounded-xl border border-line bg-white p-2.5 transition-colors hover:border-line-strong">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-subtle font-mono text-[9px] text-ink-2">{i + 1}</span>
            <span className="min-w-0">
              <span className="line-clamp-1 text-[12px] text-ink">{s.title}</span>
              <span className="line-clamp-1 text-[11px] text-muted">{host}</span>
            </span>
            <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted" />
          </a>
        );
      })}
    </div>
  );
}

export function MessageBubble({
  message,
  speaker,
  streaming,
  liveSteps,
  onTrace,
  selected,
}: {
  message: Pick<ChatMessage, "role" | "content" | "meta"> & { id?: number };
  speaker?: { name: string; color: string };
  streaming?: boolean;
  liveSteps?: Step[];
  onTrace?: () => void;
  selected?: boolean;
}) {
  if (message.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[78%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-saffron-line bg-saffron-soft px-4 py-2.5 text-[15px] leading-relaxed text-ink">
          {message.content}
        </div>
      </motion.div>
    );
  }
  const meta = message.meta || {};
  const who = speaker || { name: "Crew", color: "crew" };
  const c = colorOf(who.color);
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <Avatar name={who.name} color={who.color} size="sm" className="mt-5" />
      <div className="min-w-0 max-w-[82%] flex-1">
        <div className="mb-1 flex items-center gap-2 text-[12px]">
          <span className={cn("font-semibold", c.text)}>{who.name}</span>
          {onTrace && !streaming && (
            <button
              onClick={onTrace}
              className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors", selected ? "bg-ink text-white" : "text-muted hover:bg-subtle hover:text-ink")}
            >
              <Activity className="h-3 w-3" /> trace
            </button>
          )}
        </div>
        {liveSteps && <LiveSteps steps={liveSteps} />}
        {(message.content || streaming) && (
          <div className={cn("prose-chat inline-block rounded-2xl rounded-tl-md border px-4 py-2.5 text-[15px] leading-relaxed text-ink", c.soft, c.line, streaming && "caret")}>
            {message.content ? <ReactMarkdown>{message.content}</ReactMarkdown> : <span className="text-muted">thinking</span>}
          </div>
        )}
        <Chips chips={meta.chips || []} />
        {meta.cards?.map((card, i) => <GoalCardInline key={i} card={card} />)}
        <Sources sources={meta.sources} />
        <Chips chips={meta.memory_chips || []} />
      </div>
    </motion.div>
  );
}
