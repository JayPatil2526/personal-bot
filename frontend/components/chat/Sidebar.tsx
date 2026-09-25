"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, CrewStack, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import type { Character, SessionSummary } from "@/lib/types";
import { cn, colorOf, timeAgo } from "@/lib/utils";

export async function startChat(router: ReturnType<typeof useRouter>, target: { characterId?: number; group?: boolean }) {
  const s = await api<{ id: number }>("/sessions", {
    method: "POST",
    json: target.group ? { group: true } : { character_id: target.characterId },
  });
  router.push(`/chat/${s.id}`);
}

export function CharacterPicker({ open, onClose, characters }: { open: boolean; onClose: () => void; characters: Character[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (key: string, target: { characterId?: number; group?: boolean }) => {
    setBusy(key);
    try {
      await startChat(router, target);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const presets = characters.filter((c) => c.is_preset);
  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl">
      <h2 className="headline text-[28px]">Start a conversation</h2>
      <p className="mt-2 text-[14px] text-ink-2">Everyone shares what they know about you — each in their own style.</p>
      <button
        onClick={() => go("crew", { group: true })}
        disabled={busy !== null}
        className="dots mt-6 flex w-full items-center gap-4 rounded-2xl border border-line p-4 text-left transition-colors hover:border-line-strong"
      >
        <CrewStack crew={presets} size="md" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink">Crew huddle</div>
          <div className="text-[13px] text-ink-2">Group chat — all three reply and react to each other</div>
        </div>
        {busy === "crew" && <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />}
      </button>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {characters.map((c) => (
          <button
            key={c.id}
            onClick={() => go(String(c.id), { characterId: c.id })}
            disabled={busy !== null}
            className={cn("flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors", colorOf(c.color).soft, colorOf(c.color).line)}
          >
            <Avatar name={c.name} color={c.color} size="md" />
            <div className="min-w-0">
              <div className="font-medium text-ink">{c.name}</div>
              <div className="text-[13px] text-ink-2">{c.tagline}</div>
            </div>
            {busy === String(c.id) && <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function SessionSidebar({
  sessions,
  activeId,
  crew,
  onNew,
  onDeleted,
}: {
  sessions: SessionSummary[];
  activeId?: number;
  crew: Character[];
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
        <button onClick={onNew} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-2.5 text-[14px] font-medium text-white hover:bg-[#2c2f47]">
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>
      <div className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        <AnimatePresence initial={false}>
          {sessions.map((s) => (
            <motion.div key={s.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
              <Link href={`/chat/${s.id}`} className={cn("group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors", s.id === activeId ? "bg-subtle" : "hover:bg-subtle/70")}>
                {s.is_group ? (
                  <div className="w-[46px] shrink-0">
                    <CrewStack crew={crew.filter((c) => c.is_preset).slice(0, 3)} size="xs" />
                  </div>
                ) : (
                  <Avatar name={s.character.name} color={s.character.color} size="sm" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-ink">{s.title}</div>
                  <div className="truncate text-[11px] text-muted">
                    {s.is_group ? "Crew huddle" : s.character.name} · {timeAgo(s.updated_at)}
                  </div>
                </div>
                <button onClick={(e) => remove(e, s.id)} className="hidden rounded-full p-1 text-muted hover:text-rose group-hover:block">
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
