"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageBubble } from "@/components/chat/Message";
import { CharacterPicker, SessionSidebar, startChat } from "@/components/chat/Sidebar";
import { RetrievedMemories, StepList } from "@/components/TracePanel";
import { Avatar, Badge, CrewStack, Empty } from "@/components/ui";
import { api, streamChat } from "@/lib/api";
import type { Character, ChatMessage, MemoryItem, SessionDetail, SessionSummary, Step, Trace } from "@/lib/types";
import { cn, colorOf } from "@/lib/utils";

const SUGGESTIONS: Record<string, string[]> = {
  Arjun: ["I want to drink more water, I barely manage 1 litre", "I'll go to the gym tomorrow morning, promise", "Give me a 10-minute desk workout"],
  Meera: ["I'm feeling overwhelmed with work lately", "Help me build a calm morning routine", "What did Arjun tell you about me?"],
  Kabir: ["I want to make ₹1 lakh from mutual funds next week", "Which IPOs are in the news right now?", "I want to learn hacking"],
  Crew: ["Feeling lazy today — should I skip the gym?", "Rate my week honestly, guys", "Should I learn guitar or save for a trip?"],
};

interface LiveSpeaker {
  character_id: number;
  text: string;
}
interface Live {
  userText: string;
  steps: Step[];
  speakers: LiveSpeaker[];
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

  const openTrace = useCallback(async (messageId: number, traceId: number) => {
    setSelectedMsg(messageId);
    try {
      setTrace(await api<Trace>(`/dev/traces/${traceId}`));
      setBgSteps([]);
    } catch {}
  }, []);

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
  }, [sessionId, router, openTrace]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, live]);

  // Who is who: one character, or the whole crew in a group chat
  const people = useMemo(() => {
    const map: Record<number, { name: string; color: string }> = {};
    for (const c of characters) map[c.id] = { name: c.name, color: c.color };
    for (const c of session?.character.crew || []) map[c.id] = { name: c.name, color: c.color };
    if (session && !session.is_group) map[session.character.id] = { name: session.character.name, color: session.character.color };
    return map;
  }, [characters, session]);

  const speakerOf = (m: Pick<ChatMessage, "meta">) =>
    people[m.meta?.character_id ?? -1] || (session && !session.is_group ? { name: session.character.name, color: session.character.color } : undefined);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || !sessionId || live?.active) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setLive({ userText: message, steps: [], speakers: [], active: true });
    setBgSteps([]);
    setTrace(null);
    setSelectedMsg(null);
    let replyIds: number[] = [];
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
        } else if (event === "speaker") {
          setLive((l) => l && { ...l, speakers: [...l.speakers, { character_id: data.character_id, text: "" }] });
        } else if (event === "token") {
          setLive((l) => {
            if (!l) return l;
            const speakers = [...l.speakers];
            if (!speakers.length) speakers.push({ character_id: data.character_id, text: "" });
            const last = speakers[speakers.length - 1];
            speakers[speakers.length - 1] = { ...last, text: last.text + data.text };
            return { ...l, speakers };
          });
        } else if (event === "reply_done") {
          const msgs = (data.messages || [data.message]) as ChatMessage[];
          replyIds = msgs.map((m) => m.id);
          setMessages((m) => [...m, ...msgs]);
          setSelectedMsg(msgs[0].id);
          api<Trace>(`/dev/traces/${data.trace_id}`).then(setTrace).catch(() => {});
          setLive(null);
        } else if (event === "memory") {
          const chips = data.chips || [];
          const target = replyIds[replyIds.length - 1];
          if (target && chips.length) setMessages((m) => m.map((x) => (x.id === target ? { ...x, meta: { ...x.meta, memory_chips: chips } } : x)));
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

  const character = session?.character;
  const presets = characters.filter((c) => c.is_preset);
  const liveSteps = live?.steps ?? trace?.nodes?.filter((n) => n.phase !== "background") ?? [];
  const retrieved: MemoryItem[] = (live?.steps.find((s) => s.node === "memory_retrieval")?.detail as MemoryItem[]) || trace?.retrieved || [];
  const suggestionKey = session?.is_group ? "Crew" : character?.name || "";

  return (
    <div className="flex h-[calc(100vh-3rem)] md:h-screen">
      <div className="hidden w-64 shrink-0 border-r border-line bg-white lg:block">
        <SessionSidebar
          sessions={sessions}
          activeId={sessionId}
          crew={characters}
          onNew={() => setPicker(true)}
          onDeleted={(id) => setSessions((s) => s.filter((x) => x.id !== id))}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {!sessionId ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="w-full max-w-3xl">
              <div className="eyebrow mb-3 text-center">Chat</div>
              <h1 className="headline text-center text-[36px] md:text-[44px]">Who do you want to talk to?</h1>
              <p className="mt-3 text-center text-[15px] text-ink-2">They all remember you — and each other.</p>
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => startChat(router, { group: true })}
                className="dots mt-10 flex w-full items-center gap-4 rounded-3xl border border-line p-5 text-left transition-colors hover:border-line-strong"
              >
                <CrewStack crew={presets} size="md" />
                <div className="flex-1">
                  <div className="font-medium text-ink">Crew huddle</div>
                  <div className="text-[14px] text-ink-2">One question, three honest opinions — they react to each other</div>
                </div>
              </motion.button>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {characters.map((c, i) => (
                  <motion.button
                    key={c.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 + i * 0.05 }}
                    onClick={() => startChat(router, { characterId: c.id })}
                    className={cn("rounded-3xl border p-5 text-left transition-colors", colorOf(c.color).soft, colorOf(c.color).line)}
                  >
                    <Avatar name={c.name} color={c.color} size="lg" />
                    <div className="mt-4 font-medium text-ink">{c.name}</div>
                    <div className="text-[13px] text-ink-2">{c.tagline}</div>
                    <div className="mt-3 text-[12px] text-muted">bond · {c.bond_level}</div>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        ) : !character ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">Loading conversation…</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line bg-white px-5 py-3">
              {session?.is_group ? <CrewStack crew={character.crew || presets} size="sm" /> : <Avatar name={character.name} color={character.color} />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{session?.is_group ? "Crew huddle" : character.name}</span>
                  {!session?.is_group && <Badge className="border-line bg-subtle text-ink-2">{character.bond_level}</Badge>}
                </div>
                <div className="truncate text-[13px] text-muted">{character.tagline}</div>
              </div>
              <div className="hidden items-center gap-1.5 sm:flex">
                {!session?.is_group && (
                  <button onClick={() => startChat(router, { group: true })} className="rounded-full border border-line px-3 py-1 text-[12px] text-ink-2 hover:bg-subtle">
                    Crew huddle
                  </button>
                )}
                {presets
                  .filter((c) => session?.is_group || c.id !== character.id)
                  .slice(0, session?.is_group ? 0 : 2)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => startChat(router, { characterId: c.id })}
                      className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-3 text-[12px] text-ink-2 hover:bg-subtle"
                    >
                      <Avatar name={c.name} color={c.color} size="xs" /> {c.name}
                    </button>
                  ))}
              </div>
              <button onClick={() => setPanel(!panel)} className="hidden rounded-full p-2 text-muted hover:bg-subtle hover:text-ink xl:block" title="Agent trace">
                {panel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </button>
            </div>

            <div ref={scrollRef} className="scroll-thin flex-1 space-y-5 overflow-y-auto bg-bg px-5 py-6">
              {messages.length === 0 && !live && (
                <Empty
                  title={session?.is_group ? "Ask the whole crew" : `Say hi to ${character.name}`}
                  text={character.motivation_style}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      {(SUGGESTIONS[suggestionKey] || ["Hey! How are you?", "Help me set a goal"]).map((s) => (
                        <button key={s} onClick={() => send(s)} className="rounded-full border border-line-strong bg-white px-4 py-1.5 text-[13px] text-ink-2 hover:bg-subtle hover:text-ink">
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
                  speaker={speakerOf(m)}
                  selected={selectedMsg === m.id}
                  onTrace={m.meta?.trace_id ? () => openTrace(m.id, m.meta.trace_id!) : undefined}
                />
              ))}
              {live && live.userText && <MessageBubble message={{ role: "user", content: live.userText, meta: {} }} />}
              {live &&
                (live.speakers.length ? (
                  live.speakers.map((sp, i) => (
                    <MessageBubble
                      key={i}
                      message={{ role: "assistant", content: sp.text, meta: {} }}
                      speaker={people[sp.character_id]}
                      streaming={i === live.speakers.length - 1}
                      liveSteps={i === 0 ? live.steps : undefined}
                    />
                  ))
                ) : (
                  <MessageBubble
                    message={{ role: "assistant", content: "", meta: {} }}
                    speaker={session?.is_group ? { name: "Crew", color: "crew" } : { name: character.name, color: character.color }}
                    streaming
                    liveSteps={live.steps}
                  />
                ))}
            </div>

            <div className="border-t border-line bg-white px-5 pb-4 pt-3">
              <div className="flex items-end gap-2 rounded-3xl border border-line-strong bg-white p-1.5 pl-4 transition focus-within:border-ink/40 focus-within:ring-4 focus-within:ring-ink/5">
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
                  placeholder={session?.is_group ? "Message the crew…" : `Message ${character.name}…`}
                  className="scroll-thin max-h-40 flex-1 resize-none bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-muted"
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || !!live?.active}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition active:scale-95 disabled:opacity-25"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-muted">Remembers across sessions and shares notes with your crew · not professional advice</p>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {sessionId && panel && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="scroll-thin hidden shrink-0 overflow-y-auto border-l border-line bg-subtle xl:block"
          >
            <div className="w-[340px] space-y-6 p-4">
              <div>
                <div className="text-[14px] font-medium text-ink">Agent trace</div>
                <p className="text-[12px] text-muted">
                  {live
                    ? "Live — the graph is running"
                    : trace
                      ? `Turn #${trace.id} · ${trace.route.length} nodes · ${trace.input_tokens + trace.output_tokens} tokens`
                      : "Send a message to watch the agent work."}
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
