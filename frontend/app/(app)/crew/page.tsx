"use client";

import { motion } from "framer-motion";
import { MessageCircle, Plus, Wand2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { startChat } from "@/components/chat/Sidebar";
import { Avatar, Badge, Button, Card, CrewStack, Input, Label, Modal, PageHeader, Skeleton, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import type { Character } from "@/lib/types";
import { COLORS, cn, colorOf, timeAgo } from "@/lib/utils";

const BOND = { new: { label: "Getting to know you", pct: 20 }, friend: { label: "Friends", pct: 60 }, close: { label: "Close friends", pct: 100 } };

type Draft = Omit<Character, "id" | "is_preset" | "bond_level" | "messages_count">;

const EMPTY: Draft = {
  name: "", avatar: "", color: "indigo", tagline: "", age: 28, city: "", occupation: "", personality: "", speaking_style: "",
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
            <Avatar name={c.name} color={c.color} size="xl" />
            <div>
              <h2 className="headline text-[32px]">{c.name}</h2>
              <p className={cn("text-[14px]", colorOf(c.color).text)}>{c.tagline}</p>
              <p className="text-[13px] text-muted">
                {c.age} · {c.occupation} · {c.city}
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 text-[14px] sm:grid-cols-2">
            {[
              ["Personality", c.personality],
              ["How they talk", c.speaking_style],
              ["How they motivate you", c.motivation_style],
              ["Worldview", c.worldview],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-subtle p-4">
                <div className="eyebrow mb-1.5">{k}</div>
                <p className="leading-relaxed text-ink-2">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-2xl bg-subtle p-4 text-[14px]">
            <div className="eyebrow mb-1.5">Backstory</div>
            <p className="leading-relaxed text-ink-2">{c.backstory}</p>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <div className="eyebrow mb-2">People in their life</div>
              <div className="space-y-1.5">
                {c.family_friends.map((p) => (
                  <div key={p.name} className="rounded-xl border border-line px-3 py-2 text-[13px]">
                    <span className="font-medium text-ink">{p.name}</span> <span className="text-muted">· {p.relation}</span>
                    <div className="text-ink-2">{p.note}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="eyebrow mb-2">Their life lately</div>
              <div className="space-y-1.5">
                {c.life_events?.length ? (
                  c.life_events.map((e) => (
                    <div key={e.title + e.created_at} className="rounded-xl border border-line px-3 py-2 text-[13px]">
                      <span className="font-medium text-ink">{e.title}</span>
                      <div className="text-ink-2">{e.description}</div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {e.emotion} · {timeAgo(e.created_at)}
                        {e.shared && " · told you"}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[13px] text-muted">Nothing new yet.</p>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {c.interests.map((i) => (
              <Badge key={i} className="border-line bg-white text-ink-2">
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
      await api("/characters", { method: "POST", json: { ...d, avatar: d.avatar || d.name[0] || "?" } });
      toast.success(`${d.name} joined your crew`);
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
      <div className="eyebrow mb-2">New character</div>
      <h2 className="headline text-[28px]">Add someone to your crew</h2>
      <p className="mt-2 text-[14px] text-ink-2">Describe the vibe and let AI draft a full persona — then edit anything.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <Label>Name</Label>
          <Input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Zoya" />
        </div>
        <div>
          <Label>Colour</Label>
          <div className="flex h-11 items-center gap-2">
            {Object.entries(COLORS)
              .filter(([k]) => k !== "crew")
              .map(([k, v]) => (
                <button key={k} onClick={() => set("color", k)} className={cn("h-7 w-7 rounded-full ring-2 ring-offset-2", v.solid, d.color === k ? "ring-ink" : "ring-transparent")} />
              ))}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <Label>Vibe</Label>
        <div className="flex gap-2">
          <Input value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="A cheerful study buddy who loves productivity hacks and K-dramas" />
          <Button variant="secondary" onClick={autofill} loading={drafting}>
            {!drafting && <Wand2 className="h-4 w-4" />} Autofill
          </Button>
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
              <Badge key={p.name} className="border-line bg-subtle text-ink-2">
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

  const chat = (c: Character) => startChat(router, { characterId: c.id });

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      {params.get("welcome") && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-6 rounded-2xl border border-saffron-line bg-saffron-soft p-4 text-[14px] text-ink">
          Welcome! Meet your crew. Start a chat with anyone — tell them a goal, and the others will know too.
        </motion.div>
      )}
      <PageHeader
        eyebrow="Crew"
        title="The people in your corner"
        subtitle="Real personalities with their own lives, families and opinions — sharing one memory of you."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCreate(true)}>
              <Plus className="h-4 w-4" /> Create character
            </Button>
            <Button onClick={() => startChat(router, { group: true })}>
              {chars && <CrewStack crew={chars.filter((c) => c.is_preset)} size="xs" />} Crew huddle
            </Button>
          </div>
        }
      />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {!chars
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-80" />)
          : chars.map((c, i) => {
              const col = colorOf(c.color);
              const bond = BOND[c.bond_level] || BOND.new;
              return (
                <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="flex h-full flex-col overflow-hidden">
                    <div className={cn("flex items-end justify-between border-b px-6 pb-4 pt-6", col.soft, col.line)}>
                      <Avatar name={c.name} color={c.color} size="xl" className="bg-white" />
                      {!c.is_preset && <Badge className="border-line bg-white text-ink-2">custom</Badge>}
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="text-[22px] font-medium tracking-tight text-ink">{c.name}</h3>
                      <p className={cn("text-[14px]", col.text)}>{c.tagline}</p>
                      <p className="mt-1 text-[13px] text-muted">
                        {c.age} · {c.occupation}
                      </p>
                      <p className="mt-3 line-clamp-3 flex-1 text-[14px] leading-relaxed text-ink-2">{c.personality}</p>
                      <div className="mt-5">
                        <div className="flex justify-between text-[12px] text-muted">
                          <span>{bond.label}</span>
                          <span className="tabular-nums">{c.messages_count} messages</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#ececf1]">
                          <motion.div className={cn("h-full rounded-full", col.solid)} initial={{ width: 0 }} animate={{ width: `${bond.pct}%` }} />
                        </div>
                      </div>
                      <div className="mt-5 flex gap-2">
                        <Button className="flex-1" onClick={() => chat(c)}>
                          <MessageCircle className="h-4 w-4" /> Chat
                        </Button>
                        <Button variant="secondary" onClick={() => setDetail(c.id)}>
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
