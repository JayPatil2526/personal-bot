"use client";

import { Check, X } from "lucide-react";
import { Avatar } from "@/components/ui";
import { api } from "@/lib/api";
import type { Promise_ } from "@/lib/types";
import { cn, dueLabel } from "@/lib/utils";

export function PromiseRow({ p, onChange }: { p: Promise_; onChange: () => void }) {
  const set = async (status: "kept" | "broken") => {
    await api(`/promises/${p.id}`, { method: "PATCH", json: { status } });
    onChange();
  };
  const overdue = p.days_left < 0;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-3.5 py-3">
      {p.character ? <Avatar name={p.character.name} color={p.character.color} size="xs" /> : <Avatar name="Crew" color="crew" size="xs" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-ink">{p.text}</div>
        <div className={cn("text-[12px]", overdue ? "text-rose" : p.days_left === 0 ? "text-saffron" : "text-muted")}>
          {dueLabel(p.days_left)}
          {p.character && ` · told ${p.character.name}`}
        </div>
      </div>
      {p.days_left <= 0 && (
        <div className="flex gap-1">
          <button onClick={() => set("kept")} title="I did it" className="rounded-full border border-sage-line bg-sage-soft p-1.5 text-sage hover:bg-[#e3efd6]">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => set("broken")} title="Didn't happen" className="rounded-full border border-line p-1.5 text-muted hover:bg-subtle">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

