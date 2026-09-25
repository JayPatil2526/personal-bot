"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import type { Character, SessionSummary } from "@/lib/types";
import { cn, colorOf, timeAgo } from "@/lib/utils";

export function CharacterPicker({
  open,
  onClose,
  characters,
}: {
  open: boolean;
  onClose: () => void;
  characters: Character[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const start = async (c: Character) => {
    setBusy(c.id);
    try {
      const s = await api<{ id: number }>("/sessions", { method: "POST", json: { character_id: c.id } });
      onClose();
      router.push(`/chat/${s.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl">
      <h2 className="font-[family-name:var(--font-display)] text-3xl text-white">Who do you want to talk to?</h2>
      <p className="mt-1 text-sm text-muted">They all share what they know about you — but each has their own style.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {characters.map((c) => (
          <button
            key={c.id}
            onClick={() => start(c)}
            disabled={busy !== null}
            className={cn("group flex items-start gap-3 rounded-2xl border p-4 text-left transition hover:scale-[1.01]", colorOf(c.color).soft)}
          >
            <Avatar emoji={c.avatar} color={c.color} size="lg" />
            <div className="min-w-0">
              <div className="font-semibold text-white">{c.name}</div>
              <div className="text-xs text-soft">{c.tagline}</div>
              <div className="mt-1.5 line-clamp-2 text-[11px] text-muted">{c.motivation_style}</div>
            </div>
            {busy === c.id && <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function SessionSidebar({
  sessions,
  activeId,
  onNew,
  onDeleted,
}: {
  sessions: SessionSummary[];
  activeId?: number;
  onNew: () => void;
  onDeleted: (id: number) => void;
}) {
  const router = useRouter();
  const remove = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    await api(`/sessions/${id}`, { method: "DELETE" });
    onDeleted(id);
    if (id === activeId) router.push("/chat");
  };
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-2.5 text-sm text-white transition hover:bg-white/[0.08]"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>
      <div className="scroll-thin flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        <AnimatePresence initial={false}>
          {sessions.map((s) => (
            <motion.div key={s.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}>
              <Link
                href={`/chat/${s.id}`}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition",
                  s.id === activeId ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                )}
              >
                <Avatar emoji={s.character.avatar} color={s.character.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-white">{s.title}</div>
                  <div className="truncate text-[11px] text-muted">
                    {s.character.name} · {timeAgo(s.updated_at)}
                  </div>
                </div>
                <button onClick={(e) => remove(e, s.id)} className="hidden rounded-md p-1 text-muted hover:text-rose-300 group-hover:block">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
        {!sessions.length && <p className="px-3 py-6 text-center text-xs text-muted">No conversations yet.</p>}
      </div>
    </div>
  );
}
