"use client";

import { motion } from "framer-motion";
import { MessageCircle, Plus, Wand2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, Badge, Button, Card, Input, Label, Modal, PageHeader, Skeleton, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import type { Character } from "@/lib/types";
import { COLORS, cn, colorOf, timeAgo } from "@/lib/utils";

const BOND = { new: { label: "Getting to know", pct: 20 }, friend: { label: "Friends", pct: 60 }, close: { label: "Close friends", pct: 100 } };

type Draft = Omit<Character, "id" | "is_preset" | "bond_level" | "messages_count">;

const EMPTY: Draft = {
  name: "", avatar: "🙂", color: "violet", tagline: "", age: 28, city: "", occupation: "", personality: "", speaking_style: "",
  motivation_style: "", backstory: "", worldview: "", family_friends: [], interests: [],
};

function CharacterDetail({ id, onClose, onChat }: { id: number | null; onClose: () => void; onChat: (c: Character) => void }) {
  const [c, setC] = useState<Character | null>(null);
  useEffect(() => {
    setC(null);
    if (id) api<Character>(`/characters/${id}`).then(setC).catch(() => {});
  }, [id]);
  return (
    <Modal open={!!id} onClose={onClose} className="max-w-2xl">
      {!c ? (
        <Skeleton className="h-80" />
      ) : (
        <div>
          <div className="flex items-center gap-4">
            <Avatar emoji={c.avatar} color={c.color} size="xl" />
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">{c.name}</h2>
              <p className="text-sm text-soft">{c.tagline}</p>
              <p className="text-xs text-muted">
                {c.age} · {c.occupation} · {c.city}
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            {[
              ["Personality", c.personality],
              ["How they talk", c.speaking_style],
              ["How they motivate you", c.motivation_style],
              ["Worldview", c.worldview],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">{k}</div>
                <p className="leading-relaxed text-soft">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">Backstory</div>
            <p className="leading-relaxed text-soft">{c.backstory}</p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">People in their life</div>
              <div className="space-y-1.5">
                {c.family_friends.map((p) => (
                  <div key={p.name} className="rounded-xl bg-white/[0.03] px-3 py-2 text-xs">
                    <span className="font-medium text-white">{p.name}</span> <span className="text-muted">· {p.relation}</span>
                    <div className="text-muted">{p.note}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Their life lately</div>
              <div className="space-y-1.5">
                {c.life_events?.length ? (
                  c.life_events.map((e) => (
                    <div key={e.title + e.created_at} className="rounded-xl bg-white/[0.03] px-3 py-2 text-xs">
                      <span className="font-medium text-white">{e.title}</span>
                      <div className="text-muted">{e.description}</div>
                      <div className="mt-0.5 text-[10px] text-muted">
                        {e.emotion} · {timeAgo(e.created_at)} {e.shared && "· told you"}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted">Nothing new yet.</p>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {c.interests.map((i) => (
              <Badge key={i} className="border-white/10 bg-white/5 text-soft">
                {i}
              </Badge>
            ))}
          </div>
          <Button className="mt-6 w-full" onClick={() => onChat(c)}>
            <MessageCircle className="h-4 w-4" /> Chat with {c.name}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function CreateCharacter({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [d, setD] = useState<Draft>(EMPTY);
  const [vibe, setVibe] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Draft, v: unknown) => setD((x) => ({ ...x, [k]: v }));

  const autofill = async () => {
    if (!d.name.trim() || !vibe.trim()) return toast.error("Give a name and describe the vibe first");
    setDrafting(true);
    try {
      const r = await api<Draft>("/characters/draft", { method: "POST", json: { name: d.name, vibe } });
      setD((x) => ({ ...x, ...r, color: x.color }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      await api("/characters", { method: "POST", json: d });
      toast.success(`${d.name} joined your crew!`);
      setD(EMPTY);
      setVibe("");
      onCreated();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl">
      <h2 className="font-[family-name:var(--font-display)] text-3xl text-white">Create a crew member</h2>
      <p className="mt-1 text-sm text-muted">Describe the vibe and let AI draft a full persona — then tweak anything.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_90px]">
        <div>
          <Label>Name</Label>
          <Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Zoya" />
        </div>
        <div>
          <Label>Emoji</Label>
          <Input value={d.avatar} onChange={(e) => set("avatar", e.target.value)} className="text-center text-lg" />
        </div>
      </div>
      <div className="mt-4">
        <Label>Vibe</Label>
        <div className="flex gap-2">
          <Input value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="A cheerful study buddy who loves productivity hacks and K-dramas" />
          <Button variant="outline" onClick={autofill} loading={drafting}>
            <Wand2 className="h-4 w-4" /> Autofill
          </Button>
        </div>
      </div>
      <div className="mt-4">
        <Label>Colour</Label>
        <div className="flex gap-2">
          {Object.entries(COLORS).map(([k, v]) => (
            <button key={k} onClick={() => set("color", k)} className={cn("h-7 w-7 rounded-full bg-gradient-to-br ring-2 ring-offset-2 ring-offset-[#0e0e15]", v.grad, d.color === k ? "ring-white" : "ring-transparent")} />
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Age</Label>
          <Input type="number" value={d.age} onChange={(e) => set("age", Number(e.target.value))} />
        </div>
        <div>
          <Label>City</Label>
          <Input value={d.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div>
          <Label>Occupation</Label>
          <Input value={d.occupation} onChange={(e) => set("occupation", e.target.value)} />
        </div>
      </div>
      <div className="mt-4">
        <Label>Tagline</Label>
        <Input value={d.tagline} onChange={(e) => set("tagline", e.target.value)} />
      </div>
      {(["personality", "speaking_style", "motivation_style", "backstory", "worldview"] as const).map((k) => (
        <div key={k} className="mt-4">
          <Label>{k.replace("_", " ")}</Label>
          <Textarea rows={2} value={d[k]} onChange={(e) => set(k, e.target.value)} />
        </div>
      ))}
      {d.family_friends.length > 0 && (
        <div className="mt-4">
          <Label>People in their life</Label>
          <div className="flex flex-wrap gap-1.5">
            {d.family_friends.map((p) => (
              <Badge key={p.name} className="border-white/10 bg-white/5 text-soft">
                {p.name} · {p.relation}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <Button className="mt-6 w-full" onClick={save} loading={saving} disabled={!d.name.trim() || !d.personality.trim()}>
        <Plus className="h-4 w-4" /> Add to crew
      </Button>
    </Modal>
  );
}

function CrewInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [chars, setChars] = useState<Character[] | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const [create, setCreate] = useState(false);
  const load = () => api<Character[]>("/characters").then(setChars).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const chat = async (c: Character) => {
    const s = await api<{ id: number }>("/sessions", { method: "POST", json: { character_id: c.id } });
    router.push(`/chat/${s.id}`);
  };

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      {params.get("welcome") && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.07] p-4 text-sm text-fuchsia-100">
          👋 Welcome! Meet your crew. Start a chat with anyone — tell them a goal, and the others will know too.
        </motion.div>
      )}
      <PageHeader
        title={
          <>
            Your <span className="italic text-gradient">crew</span>
          </>
        }
        subtitle="Real personalities with their own lives, families and opinions — sharing one memory of you."
        action={
          <Button variant="outline" onClick={() => setCreate(true)}>
            <Plus className="h-4 w-4" /> Create character
          </Button>
        }
      />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {!chars
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-80" />)
          : chars.map((c, i) => {
              const col = colorOf(c.color);
              const bond = BOND[c.bond_level] || BOND.new;
              return (
                <motion.div key={c.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} whileHover={{ y: -4 }}>
                  <Card className="relative h-full overflow-hidden p-6">
                    <div className={cn("absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br opacity-25 blur-3xl", col.grad)} />
                    <div className="relative">
                      <div className="flex items-start justify-between">
                        <Avatar emoji={c.avatar} color={c.color} size="xl" />
                        {!c.is_preset && <Badge className="border-white/10 bg-white/5 text-muted">custom</Badge>}
                      </div>
                      <h3 className="mt-4 text-2xl font-semibold text-white">{c.name}</h3>
                      <p className={cn("text-sm", col.text)}>{c.tagline}</p>
                      <p className="mt-1 text-xs text-muted">
                        {c.age} · {c.occupation}
                      </p>
                      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-soft">{c.personality}</p>
                      <div className="mt-4">
                        <div className="flex justify-between text-[11px] text-muted">
                          <span>Bond · {bond.label}</span>
                          <span>{c.messages_count} msgs</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <motion.div className={cn("h-full rounded-full bg-gradient-to-r", col.grad)} initial={{ width: 0 }} animate={{ width: `${bond.pct}%` }} />
                        </div>
                      </div>
                      <div className="mt-5 flex gap-2">
                        <Button className="flex-1" onClick={() => chat(c)}>
                          <MessageCircle className="h-4 w-4" /> Chat
                        </Button>
                        <Button variant="outline" onClick={() => setDetail(c.id)}>
                          Profile
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
      </div>
      <CharacterDetail id={detail} onClose={() => setDetail(null)} onChat={chat} />
      <CreateCharacter open={create} onClose={() => setCreate(false)} onCreated={load} />
    </div>
  );
}

export default function CrewPage() {
  return (
    <Suspense>
      <CrewInner />
    </Suspense>
  );
}
