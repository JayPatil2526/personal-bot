"use client";

import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Brain, Handshake, Scale } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/AppShell";
import { Avatar } from "@/components/ui";
import { getToken } from "@/lib/api";

const THREAD = [
  { who: "you", text: "Feeling lazy today… should I skip the gym and rest?" },
  { who: "Meera", color: "sage", text: "Listening to your body matters. A gentle stretch and an early night is a win too." },
  { who: "Arjun", color: "saffron", text: "Meera's right about rest — but lazy isn't tired. 20 minutes, light. Chal." },
  { who: "Kabir", color: "indigo", text: "Also, you promised a walk yesterday. Did that happen, boss? 👀" },
];

const DIFFERENT = [
  {
    icon: Handshake,
    title: "It follows up",
    text: "Say “I’ll go to the gym tomorrow” and it becomes a promise with a date. Tomorrow, any crew member asks if you did it.",
  },
  {
    icon: Brain,
    title: "It remembers — visibly",
    text: "Episodic memory of what happened and how it felt, shared across characters. You can read, search and delete it.",
  },
  {
    icon: Scale,
    title: "It checks your goals",
    text: "Every goal is validated for safety and feasibility. Unrealistic ones are reframed, harmful ones refused.",
  },
  {
    icon: BarChart3,
    title: "It reports from your data",
    text: "A weekly report computed from your own habits, moods and promises — not generated guesses.",
  },
];

const STEPS = ["Understand", "Safety", "Validate", "Search", "Plan", "Track", "Remember", "Reply"];

export default function Landing() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => setAuthed(!!getToken()), []);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] opacity-70">
        <div className="sunrise mx-auto h-full max-w-5xl" />
      </div>

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex gap-2">
          <Link href={authed ? "/dashboard" : "/login"} className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-white hover:bg-[#2c2f47]">
            {authed ? "Open app" : "Log in"}
          </Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-4xl px-6 pb-16 pt-20 text-center md:pt-28">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto mb-7 inline-block border-y border-indigo-line px-6 py-2 text-[14px] text-indigo">
          Conversational lifestyle & goal tracking · episodic memory
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.5 }}
          className="headline text-[44px] md:text-[68px]"
        >
          A crew that remembers,
          <br />
          so you follow through.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5 }}
          className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2"
        >
          Three companions with their own lives and styles, one shared memory of you — turning goals into daily plans,
          promises into follow-ups, and weeks into honest reports.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-9 flex justify-center gap-3">
          <Link
            href={authed ? "/dashboard" : "/login?mode=register"}
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-ink px-7 text-[15px] font-medium text-white hover:bg-[#2c2f47]"
          >
            Get started <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <a href="#different" className="inline-flex h-12 items-center rounded-full border border-line-strong bg-white px-7 text-[15px] text-ink hover:bg-subtle">
            What&apos;s different
          </a>
        </motion.div>
      </section>

      {/* Product preview */}
      <section className="relative mx-auto max-w-5xl px-6 pb-24">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="card overflow-hidden p-2 shadow-xl shadow-ink/5">
          <div className="grid overflow-hidden rounded-2xl border border-line md:grid-cols-[1fr_1.3fr]">
            <div className="dots flex flex-col justify-center gap-3 p-8">
              <div className="eyebrow">Crew huddle</div>
              <div className="text-xl font-medium tracking-tight text-ink">One question. Three honest opinions.</div>
              <p className="text-sm leading-relaxed text-ink-2">
                They read each other&apos;s replies, agree, push back — and bring up the promise you made yesterday.
              </p>
              <div className="mt-2 flex gap-2">
                {[
                  ["Arjun", "saffron", "Coach"],
                  ["Meera", "sage", "Friend"],
                  ["Kabir", "indigo", "Mentor"],
                ].map(([n, c, r]) => (
                  <div key={n} className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 text-xs text-ink-2">
                    <Avatar name={n} color={c} size="xs" /> {r}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3 bg-white p-6">
              {THREAD.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + i * 0.25 }}
                  className={m.who === "you" ? "flex justify-end" : "flex items-end gap-2"}
                >
                  {m.who !== "you" && <Avatar name={m.who} color={m.color} size="sm" />}
                  <div
                    className={
                      m.who === "you"
                        ? "max-w-[78%] rounded-2xl rounded-br-md border border-saffron-line bg-saffron-soft px-4 py-2.5 text-[14px] text-ink"
                        : "max-w-[78%] rounded-2xl rounded-bl-md border border-line bg-subtle px-4 py-2.5 text-[14px] text-ink"
                    }
                  >
                    {m.who !== "you" && <div className="mb-0.5 text-[11px] font-medium text-muted">{m.who}</div>}
                    {m.text}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* What's different */}
      <section id="different" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="eyebrow mb-3 text-center">Not another chatbot</div>
        <h2 className="headline mx-auto max-w-2xl text-center text-[34px] md:text-[42px]">What a chat window can&apos;t do on its own</h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DIFFERENT.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="card p-6">
              <f.icon className="h-5 w-5 text-ink" strokeWidth={1.8} />
              <div className="mt-5 font-medium text-ink">{f.title}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-white py-20">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <div className="eyebrow mb-3">Under the hood</div>
          <h2 className="headline text-[30px] md:text-[38px]">Every message runs an agent graph</h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] text-ink-2">
            LangGraph routes each message through only the steps it needs; a background graph then writes and compresses memory.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-full border border-line bg-bg px-4 py-2 font-mono text-[12px] text-ink-2"
                >
                  {s.toLowerCase()}
                </motion.div>
                {i < STEPS.length - 1 && <div className="h-px w-4 bg-line-strong" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-10 text-center text-[13px] text-muted">Conversational Lifestyle & Goal-Tracking AI with Episodic Memory · Minor Project</footer>
    </div>
  );
}
