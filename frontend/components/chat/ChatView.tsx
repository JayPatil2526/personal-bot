"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, PanelRightClose, PanelRightOpen, Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageBubble } from "@/components/chat/Message";
import { CharacterPicker, SessionSidebar } from "@/components/chat/Sidebar";
import { RetrievedMemories, StepList } from "@/components/TracePanel";
import { Avatar, Badge, Empty } from "@/components/ui";
import { api, streamChat } from "@/lib/api";
import type { Character, ChatMessage, MemoryItem, SessionDetail, SessionSummary, Step, Trace } from "@/lib/types";
import { cn, colorOf } from "@/lib/utils";

const SUGGESTIONS: Record<string, string[]> = {
  Arjun: ["I want to drink more water, I barely manage 1 litre", "Skipped the gym again today 😩", "Give me a 10-minute desk workout"],
  Meera: ["I'm feeling overwhelmed with work lately", "Help me build a calm morning routine", "What did Arjun tell you about me?"],
  Kabir: ["I want to make ₹1 lakh from mutual funds next week", "Which IPOs are hot right now?", "I want to learn hacking"],
};

interface Live {
  userText: string;
  text: string;
  steps: Step[];
  active: boolean;
}

function upsert(steps: Step[], s: Step) {
  const i = steps.findIndex((x) => x.node === s.node);
  if (i === -1) return [...steps, s];
  const next = [...steps];
  next[i] = { ...next[i], ...s };
  return next;
}

export default function ChatView({ sessionId }: { sessionId?: number }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [bgSteps, setBgSteps] = useState<Step[]>([]);
  const [bgRunning, setBgRunning] = useState(false);
  const [input, setInput] = useState("");
  const [picker, setPicker] = useState(false);
  const [panel, setPanel] = useState(true);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const loadSessions = useCallback(() => api<SessionSummary[]>("/sessions").then(setSessions).catch(() => {}), []);

  useEffect(() => {
    loadSessions();
    api<Character[]>("/characters").then(setCharacters).catch(() => {});
  }, [loadSessions]);

  useEffect(() => {
    if (!sessionId) return;
    setSession(null);
    setTrace(null);
    setBgSteps([]);
    api<SessionDetail>(`/sessions/${sessionId}`)
      .then((s) => {
        setSession(s);
        setMessages(s.messages);
        const lastBot = [...s.messages].reverse().find((m) => m.role === "assistant" && m.meta?.trace_id);
        if (lastBot?.meta.trace_id) openTrace(lastBot.id, lastBot.meta.trace_id);
      })
      .catch(() => router.push("/chat"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, live?.text, live?.steps.length]);

  const openTrace = async (messageId: number, traceId: number) => {
    setSelectedMsg(messageId);
    try {
      setTrace(await api<Trace>(`/dev/traces/${traceId}`));
      setBgSteps([]);
    } catch {}
  };

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || !sessionId || live?.active) return;
    setInput("");
    setLive({ userText: message, text: "", steps: [], active: true });
    setBgSteps([]);
    setTrace(null);
    setSelectedMsg(null);
    let assistantId: number | null = null;
    try {
      await streamChat(sessionId, message, (event, data) => {
        if (event === "user_message") {
          setMessages((m) => [...m, data as ChatMessage]);
          setLive((l) => l && { ...l, userText: "" });
        } else if (event === "step") {
          const step = data as Step;
          if (step.phase === "background") {
            setBgRunning(true);
            setBgSteps((s) => upsert(s, step));
          } else setLive((l) => l && { ...l, steps: upsert(l.steps, step) });
        } else if (event === "token") {
          setLive((l) => l && { ...l, text: l.text + data.text });
        } else if (event === "reply_done") {
          const msg = data.message as ChatMessage;
          assistantId = msg.id;
          setMessages((m) => [...m, msg]);
          setSelectedMsg(msg.id);
          api<Trace>(`/dev/traces/${data.trace_id}`).then(setTrace).catch(() => {});
          setLive(null);
        } else if (event === "memory") {
          const chips = data.chips || [];
          if (assistantId && chips.length)
            setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, meta: { ...x.meta, memory_chips: chips } } : x)));
        } else if (event === "done") {
          setBgRunning(false);
          loadSessions();
        } else if (event === "error") {
          toast.error(data.message || "Something went wrong");
        }
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLive(null);
      setBgRunning(false);
      taRef.current?.focus();
    }
  };

  const switchTo = async (c: Character) => {
    const s = await api<{ id: number }>("/sessions", { method: "POST", json: { character_id: c.id } });
    router.push(`/chat/${s.id}`);
  };

  const character = session?.character;
  const liveSteps = live?.steps ?? trace?.nodes?.filter((n) => n.phase !== "background") ?? [];
  const retrieved: MemoryItem[] =
    (live?.steps.find((s) => s.node === "memory_retrieval")?.detail as MemoryItem[]) || trace?.retrieved || [];

  return (
    <div className="flex h-[calc(100vh-3rem)] md:h-screen">
      {/* Sessions */}
      <div className="hidden w-64 shrink-0 border-r border-white/[0.06] bg-black/10 lg:block">
        <SessionSidebar
          sessions={sessions}
          activeId={sessionId}
          onNew={() => setPicker(true)}
          onDeleted={(id) => setSessions((s) => s.filter((x) => x.id !== id))}
        />
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!sessionId ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="w-full max-w-2xl text-center">
              <h1 className="font-[family-name:var(--font-display)] text-5xl text-white">
                Who&apos;s on your <span className="italic text-gradient">mind</span> today?
              </h1>
              <p className="mt-3 text-sm text-muted">Pick a crew member. They all remember you — and each other.</p>
              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {characters.map((c, i) => (
                  <motion.button
                    key={c.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ y: -4 }}
                    onClick={() => switchTo(c)}
                    className={cn("rounded-3xl border p-5 text-left transition", colorOf(c.color).soft)}
                  >
                    <Avatar emoji={c.avatar} color={c.color} size="lg" />
                    <div className="mt-3 font-semibold text-white">{c.name}</div>
                    <div className="text-xs text-soft">{c.tagline}</div>
                    <Badge className="mt-3 border-white/10 bg-white/5 text-muted">bond: {c.bond_level}</Badge>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        ) : !character ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading conversation…</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3 backdrop-blur-xl">
              <Avatar emoji={character.avatar} color={character.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{character.name}</span>
                  <Badge className="border-white/10 bg-white/5 text-muted">{character.bond_level}</Badge>
                </div>
                <div className="truncate text-xs text-muted">{character.tagline}</div>
              </div>
              <div className="hidden items-center gap-1 sm:flex">
                {characters
                  .filter((c) => c.id !== character.id)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => switchTo(c)}
                      title={`Talk to ${c.name}`}
                      className="group flex items-center gap-1.5 rounded-xl border border-white/[0.06] px-2 py-1 text-xs text-muted transition hover:border-white/15 hover:text-white"
                    >
                      <Repeat className="h-3 w-3" /> {c.avatar} {c.name}
                    </button>
                  ))}
              </div>
              <button onClick={() => setPanel(!panel)} className="hidden rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white xl:block" title="Agent trace">
                {panel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="scroll-thin flex-1 space-y-5 overflow-y-auto px-5 py-6">
              {messages.length === 0 && !live && (
                <Empty
                  icon={character.avatar}
                  title={`Say hi to ${character.name}`}
                  text={character.motivation_style}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      {(SUGGESTIONS[character.name] || ["Hey! How are you?", "Help me set a goal"]).map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-soft transition hover:bg-white/[0.07] hover:text-white"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  }
                />
              )}
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  character={character}
                  selected={selectedMsg === m.id}
                  onTrace={m.meta?.trace_id ? () => openTrace(m.id, m.meta.trace_id!) : undefined}
                />
              ))}
              {live && live.userText && <MessageBubble message={{ role: "user", content: live.userText, meta: {} }} character={character} />}
              {live && (
                <MessageBubble
                  message={{ role: "assistant", content: live.text, meta: {} }}
                  character={character}
                  streaming
                  liveSteps={live.steps}
                />
              )}
            </div>

            {/* Composer */}
            <div className="px-5 pb-5">
              <div className="glass flex items-end gap-2 rounded-3xl p-2 pl-4 focus-within:border-violet-400/30">
                <textarea
                  ref={taRef}
                  rows={1}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={`Message ${character.name}…`}
                  className="scroll-thin max-h-40 flex-1 resize-none bg-transparent py-2 text-[14.5px] text-white outline-none placeholder:text-muted"
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || !!live?.active}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl btn-gradient text-white transition active:scale-95 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[10.5px] text-muted">
                {character.name} remembers across sessions and shares notes with your crew · not professional advice
              </p>
            </div>
          </>
        )}
      </div>

      {/* Agent trace panel */}
      <AnimatePresence>
        {sessionId && panel && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="scroll-thin hidden shrink-0 overflow-y-auto border-l border-white/[0.06] bg-black/20 xl:block"
          >
            <div className="w-[340px] space-y-6 p-4">
              <div>
                <div className="text-sm font-semibold text-white">Agent trace</div>
                <p className="text-[11px] text-muted">
                  {live ? "Live — the graph is running…" : trace ? `Turn #${trace.id} · ${trace.route.length} nodes · ${trace.input_tokens + trace.output_tokens} tokens` : "Send a message to see the agent think."}
                </p>
              </div>
              <StepList steps={liveSteps} title="Foreground graph" />
              {(bgSteps.length > 0 || bgRunning) && <StepList steps={bgSteps} title="Background memory graph" />}
              <RetrievedMemories items={retrieved} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <CharacterPicker open={picker} onClose={() => setPicker(false)} characters={characters} />
    </div>
  );
}
