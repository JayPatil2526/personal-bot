"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Plus, ShieldX, Sparkles, Trash2, Wand2 } from "lucide-react";
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

const LOADING_STEPS = ["⚖️ Checking safety & feasibility", "🌐 Looking up live info", "🗺️ Drafting milestones & daily plan"];

export default function GoalWizard({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (g: Goal) => void }) {
  const [stage, setStage] = useState<"form" | "loading" | "review">("form");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [characters, setCharacters] = useState<Character[]>([]);
  // editable plan
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
      const p = await api<Preview>("/goals/preview", {
        method: "POST",
        json: { title, description, deadline: deadline || null },
      });
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
      const g = await api<Goal>("/goals", {
        method: "POST",
        json: {
          title: pTitle,
          description: preview.plan?.description || description,
          category: preview.validation.category,
          priority,
          deadline: pDeadline || null,
          milestones: milestones.filter((m) => m.trim()),
          todos: todos.filter((t) => t.title.trim()),
          visibility,
          feasibility: preview.validation.feasibility,
          safety_tier: preview.validation.tier === "reframe" ? "reframed" : "safe",
          validation_note: preview.validation.reason + (preview.validation.expert_advice ? ` Expert advice: ${preview.validation.expert_advice}` : ""),
          original_request: title,
          sources: preview.sources,
        },
      });
      toast.success("Goal created — your crew knows about it 🎯");
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
          <motion.div key="form" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-white">What do you want to achieve?</h2>
            <p className="mt-1 text-sm text-muted">Say it in your own words. The AI checks it, then drafts a realistic plan you can edit.</p>
            <div className="mt-6 space-y-4">
              <div>
                <Label>Your goal</Label>
                <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Drink 2 litres of water every day" onKeyDown={(e) => e.key === "Enter" && runPreview()} />
              </div>
              <div>
                <Label hint="optional">Why / context</Label>
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="I feel tired at work and want more energy" />
              </div>
              <div>
                <Label hint="optional — AI suggests one">Deadline</Label>
                <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="[color-scheme:dark]" />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {["Drink 2L water daily", "Learn ethical hacking", "Earn ₹1 lakh from mutual funds in a week", "Read 10 pages every night"].map((s) => (
                  <button key={s} onClick={() => setTitle(s)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted hover:bg-white/5 hover:text-white">
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <Button size="lg" className="mt-6 w-full" onClick={runPreview} disabled={!title.trim()}>
              <Wand2 className="h-4 w-4" /> Validate & plan with AI
            </Button>
          </motion.div>
        )}

        {stage === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-10">
            <div className="mx-auto mb-8 h-14 w-14 animate-spin rounded-full border-2 border-white/10 border-t-fuchsia-400" />
            <div className="mx-auto max-w-xs space-y-3">
              {LOADING_STEPS.map((s, i) => (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: i <= loadingIdx ? 1 : 0.25, x: 0 }}
                  className="flex items-center gap-2 text-sm text-soft"
                >
                  {i < loadingIdx ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <span className="h-4 w-4" />}
                  {s}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {stage === "review" && v && (
          <motion.div key="review" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            {/* Verdict */}
            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4",
                v.tier === "accept" && "border-emerald-400/25 bg-emerald-400/[0.07]",
                v.tier === "reframe" && "border-amber-400/25 bg-amber-400/[0.07]",
                v.tier === "refuse" && "border-rose-400/25 bg-rose-400/[0.07]",
              )}
            >
              {v.tier === "accept" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />}
              {v.tier === "reframe" && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />}
              {v.tier === "refuse" && <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">
                  {v.tier === "accept" ? "Looks great — safe and realistic" : v.tier === "reframe" ? "We suggest a better version" : "We can't help with this goal"}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-soft">{v.reason}</p>
                {v.expert_advice && <p className="mt-1.5 text-xs text-amber-200/90">💡 {v.expert_advice}</p>}
                {v.tier !== "refuse" && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                    Feasibility
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${v.feasibility * 100}%` }} />
                    </div>
                    {Math.round(v.feasibility * 100)}%
                  </div>
                )}
              </div>
            </div>

            {v.tier === "refuse" ? (
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStage("form")}>
                  Try another goal
                </Button>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <div>
                  <Label>Goal</Label>
                  <Input value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
                  {v.tier === "reframe" && <p className="mt-1 text-[11px] text-muted">You asked: <span className="line-through">{title}</span></p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Priority</Label>
                    <Segmented<Priority>
                      value={priority}
                      onChange={setPriority}
                      options={(["low", "medium", "high", "urgent"] as Priority[]).map((p) => ({ value: p, label: p }))}
                    />
                  </div>
                  <div>
                    <Label>Deadline</Label>
                    <Input type="date" value={pDeadline} onChange={(e) => setPDeadline(e.target.value)} className="[color-scheme:dark]" />
                  </div>
                </div>
                <div>
                  <Label hint="AI drafted — edit freely">Milestones</Label>
                  <div className="space-y-2">
                    {milestones.map((m, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="flex h-11 w-8 items-center justify-center font-mono text-xs text-muted">{i + 1}</span>
                        <Input value={m} onChange={(e) => setMilestones(milestones.map((x, j) => (j === i ? e.target.value : x)))} />
                        <button onClick={() => setMilestones(milestones.filter((_, j) => j !== i))} className="px-2 text-muted hover:text-rose-300">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setMilestones([...milestones, ""])} className="flex items-center gap-1 text-xs text-muted hover:text-white">
                      <Plus className="h-3.5 w-3.5" /> Add milestone
                    </button>
                  </div>
                </div>
                <div>
                  <Label>Daily plan (todos)</Label>
                  <div className="space-y-2">
                    {todos.map((t, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={t.title} onChange={(e) => setTodos(todos.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                        <select
                          value={t.recurrence}
                          onChange={(e) => setTodos(todos.map((x, j) => (j === i ? { ...x, recurrence: e.target.value as PlanTodo["recurrence"] } : x)))}
                          className="h-11 rounded-xl border border-white/10 bg-[#14141d] px-2 text-xs text-white"
                        >
                          <option value="daily">daily</option>
                          <option value="weekly">weekly</option>
                          <option value="once">once</option>
                        </select>
                        <button onClick={() => setTodos(todos.filter((_, j) => j !== i))} className="px-2 text-muted hover:text-rose-300">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setTodos([...todos, { title: "", recurrence: "daily", time_hint: "" }])} className="flex items-center gap-1 text-xs text-muted hover:text-white">
                      <Plus className="h-3.5 w-3.5" /> Add todo
                    </button>
                  </div>
                </div>
                <div>
                  <Label hint="who can see & nudge you about it">Shared with</Label>
                  <div className="flex flex-wrap gap-2">
                    {characters.map((c) => {
                      const on = visibility === "all" || visibility.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => toggleVis(c.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs transition",
                            on ? "border-white/20 bg-white/[0.07] text-white" : "border-white/[0.06] text-muted opacity-60",
                          )}
                        >
                          <Avatar emoji={c.avatar} color={c.color} size="sm" className="h-6 w-6 text-sm" /> {c.name}
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
                    <Sparkles className="h-4 w-4" /> Create goal
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
