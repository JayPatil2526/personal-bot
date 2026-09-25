"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Plus, ShieldX, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sources } from "@/components/chat/Message";
import { Avatar, Button, Input, Label, Modal, Segmented, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import type { Character, Goal, Priority, Source, Validation } from "@/lib/types";
import { cn } from "@/lib/utils";

type PlanTodo = { title: string; recurrence: "daily" | "weekly" | "once"; time_hint: string };

interface Preview {
  validation: Validation;
  plan: { description: string; milestones: string[]; todos: PlanTodo[] } | null;
  sources: Source[];
  steps: { node: string; label: string; ms: number }[];
  deadline: string;
}

const LOADING_STEPS = ["Checking safety and feasibility", "Looking up current information", "Drafting milestones and a daily plan"];

export default function GoalWizard({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (g: Goal) => void }) {
  const [stage, setStage] = useState<"form" | "loading" | "review">("form");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [pTitle, setPTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [pDeadline, setPDeadline] = useState("");
  const [milestones, setMilestones] = useState<string[]>([]);
  const [todos, setTodos] = useState<PlanTodo[]>([]);
  const [visibility, setVisibility] = useState<"all" | number[]>("all");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) api<Character[]>("/characters").then(setCharacters).catch(() => {});
    else
      setTimeout(() => {
        setStage("form");
        setTitle("");
        setDescription("");
        setDeadline("");
        setPreview(null);
      }, 250);
  }, [open]);

  useEffect(() => {
    if (stage !== "loading") return;
    setLoadingIdx(0);
    const t = setInterval(() => setLoadingIdx((i) => Math.min(i + 1, LOADING_STEPS.length - 1)), 1600);
    return () => clearInterval(t);
  }, [stage]);

  const runPreview = async () => {
    if (!title.trim()) return;
    setStage("loading");
    try {
      const p = await api<Preview>("/goals/preview", { method: "POST", json: { title, description, deadline: deadline || null } });
      setPreview(p);
      setPTitle(p.validation.title);
      setPriority(p.validation.suggested_priority);
      setPDeadline(p.deadline);
      setMilestones(p.plan?.milestones || []);
      setTodos(p.plan?.todos || []);
      setVisibility("all");
      setStage("review");
    } catch (e) {
      toast.error((e as Error).message);
      setStage("form");
    }
  };

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const v = preview.validation;
      const g = await api<Goal>("/goals", {
        method: "POST",
        json: {
          title: pTitle,
          description: preview.plan?.description || description,
          category: v.category,
          priority,
          deadline: pDeadline || null,
          milestones: milestones.filter((m) => m.trim()),
          todos: todos.filter((t) => t.title.trim()),
          visibility,
          feasibility: v.feasibility,
          safety_tier: v.tier === "reframe" ? "reframed" : "safe",
          validation_note: v.reason + (v.expert_advice ? ` Expert advice: ${v.expert_advice}` : ""),
          original_request: title,
          sources: preview.sources,
        },
      });
      toast.success("Goal created — your crew knows about it");
      onCreated(g);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const v = preview?.validation;
  const toggleVis = (id: number) => {
    const current = visibility === "all" ? characters.map((c) => c.id) : visibility;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setVisibility(next.length === characters.length ? "all" : next);
  };

  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl">
      <AnimatePresence mode="wait">
        {stage === "form" && (
          <motion.div key="form" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
            <div className="eyebrow mb-2">New goal</div>
            <h2 className="headline text-[28px]">What do you want to achieve?</h2>
            <p className="mt-2 text-[14px] text-ink-2">Say it in your own words. It&apos;s checked for safety and feasibility, then planned — you can edit everything.</p>
            <div className="mt-6 space-y-4">
              <div>
                <Label>Goal</Label>
                <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Drink 2 litres of water every day" onKeyDown={(e) => e.key === "Enter" && runPreview()} />
              </div>
              <div>
                <Label hint="optional">Why / context</Label>
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="I feel tired at work and want more energy" />
              </div>
              <div>
                <Label hint="optional">Deadline</Label>
                <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {["Drink 2L water daily", "Learn ethical hacking", "Earn ₹1 lakh from mutual funds in a week", "Read 10 pages every night"].map((s) => (
                  <button key={s} onClick={() => setTitle(s)} className="rounded-full border border-line px-3 py-1 text-[12px] text-ink-2 hover:bg-subtle">
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <Button size="lg" className="mt-7 w-full" onClick={runPreview} disabled={!title.trim()}>
              Check & plan
            </Button>
          </motion.div>
        )}

        {stage === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-12">
            <div className="mx-auto max-w-xs space-y-4">
              {LOADING_STEPS.map((s, i) => (
                <motion.div key={s} initial={{ opacity: 0 }} animate={{ opacity: i <= loadingIdx ? 1 : 0.35 }} className="flex items-center gap-3 text-[14px] text-ink">
                  {i < loadingIdx ? (
                    <CheckCircle2 className="h-4 w-4 text-sage" />
                  ) : i === loadingIdx ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border-2 border-line" />
                  )}
                  {s}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {stage === "review" && v && (
          <motion.div key="review" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4",
                v.tier === "accept" && "border-sage-line bg-sage-soft",
                v.tier === "reframe" && "border-amber-line bg-amber-soft",
                v.tier === "refuse" && "border-rose-line bg-rose-soft",
              )}
            >
              {v.tier === "accept" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sage" />}
              {v.tier === "reframe" && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />}
              {v.tier === "refuse" && <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-rose" />}
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-ink">
                  {v.tier === "accept" ? "Safe and realistic" : v.tier === "reframe" ? "Here's a more realistic version" : "We can't help with this goal"}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{v.reason}</p>
                {v.expert_advice && <p className="mt-1.5 text-[13px] text-ink-2">Tip: {v.expert_advice}</p>}
                {v.tier !== "refuse" && (
                  <div className="mt-2 flex items-center gap-2 text-[12px] text-muted">
                    Feasibility
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-ink" style={{ width: `${v.feasibility * 100}%` }} />
                    </div>
                    <span className="tabular-nums">{Math.round(v.feasibility * 100)}%</span>
                  </div>
                )}
              </div>
            </div>

            {v.tier === "refuse" ? (
              <div className="mt-6 flex justify-end">
                <Button variant="secondary" onClick={() => setStage("form")}>
                  Try another goal
                </Button>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <div>
                  <Label>Goal</Label>
                  <Input value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
                  {v.tier === "reframe" && (
                    <p className="mt-1 text-[12px] text-muted">
                      You asked: <span className="line-through">{title}</span>
                    </p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Priority</Label>
                    <Segmented<Priority> value={priority} onChange={setPriority} options={(["low", "medium", "high", "urgent"] as Priority[]).map((p) => ({ value: p, label: p }))} />
                  </div>
                  <div>
                    <Label>Deadline</Label>
                    <Input type="date" value={pDeadline} onChange={(e) => setPDeadline(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label hint="drafted by AI — edit freely">Milestones</Label>
                  <div className="space-y-2">
                    {milestones.map((m, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-5 text-center font-mono text-[12px] text-muted">{i + 1}</span>
                        <Input value={m} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? e.target.value : x)))} />
                        <button onClick={() => setMilestones(milestones.filter((_, j) => j !== i))} className="p-2 text-muted hover:text-rose">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setMilestones([...milestones, ""])} className="flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
                      <Plus className="h-3.5 w-3.5" /> Add milestone
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Daily plan</Label>
                  <div className="space-y-2">
                    {todos.map((t, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={t.title} onChange={(e) => setTodos(todos.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                        <select
                          value={t.recurrence}
                          onChange={(e) => setTodos(todos.map((x, j) => (j === i ? { ...x, recurrence: e.target.value as PlanTodo["recurrence"] } : x)))}
                          className="h-11 rounded-xl border border-line-strong bg-white px-2 text-[13px] text-ink"
                        >
                          <option value="daily">daily</option>
                          <option value="weekly">weekly</option>
                          <option value="once">once</option>
                        </select>
                        <button onClick={() => setTodos(todos.filter((_, j) => j !== i))} className="p-2 text-muted hover:text-rose">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setTodos([...todos, { title: "", recurrence: "daily", time_hint: "" }])} className="flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
                      <Plus className="h-3.5 w-3.5" /> Add todo
                    </button>
                  </div>
                </div>
                <div>
                  <Label hint="who can see it and nudge you">Shared with</Label>
                  <div className="flex flex-wrap gap-2">
                    {characters.map((c) => {
                      const on = visibility === "all" || visibility.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => toggleVis(c.id)}
                          className={cn("flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition", on ? "border-line-strong bg-white text-ink" : "border-line text-muted opacity-50")}
                        >
                          <Avatar name={c.name} color={c.color} size="xs" /> {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {preview.sources.length > 0 && (
                  <div>
                    <Label>Sources used</Label>
                    <Sources sources={preview.sources} />
                  </div>
                )}
                <div className="flex justify-between gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setStage("form")}>
                    Back
                  </Button>
                  <Button onClick={save} loading={saving}>
                    Create goal
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
