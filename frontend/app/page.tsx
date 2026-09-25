"use client";

import { motion } from "framer-motion";
import { ArrowRight, Brain, Globe, ShieldCheck, Sparkles, Target, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/AppShell";
import { getToken } from "@/lib/api";

const CREW = [
  { name: "Arjun", emoji: "🏋️", tag: "No-excuses fitness coach", line: "2 litres. Today. No excuses. 💪", from: "from-orange-500/30", ring: "ring-orange-400/30" },
  { name: "Meera", emoji: "🌿", tag: "Calm, mindful friend", line: "Arjun was intense today 😅 small sips, small steps ✨", from: "from-emerald-500/30", ring: "ring-emerald-400/30" },
  { name: "Kabir", emoji: "🧠", tag: "Witty money & career mentor", line: "₹1 lakh in a week? Bro. Let's talk SIPs. 📈", from: "from-sky-500/30", ring: "ring-sky-400/30" },
];

const FEATURES = [
  { icon: Brain, title: "Episodic memory", text: "Remembers what happened, when and how it felt — across every session and every character." },
  { icon: Target, title: "Goals → plans → habits", text: "Turns a wish into milestones and daily todos, tracks progress, streaks and priority." },
  { icon: ShieldCheck, title: "Goal validation", text: "Checks every goal for safety and feasibility. Reframes the unrealistic, refuses the harmful." },
  { icon: Globe, title: "Tool-using agent", text: "Searches the web for live info, updates your progress and plans — not just chat." },
  { icon: Users, title: "A crew, not a bot", text: "Distinct personalities with their own lives that share one brain about you." },
  { icon: Sparkles, title: "Transparent AI", text: "Watch the agent think: every step, tool, memory and token in the developer view." },
];

const PIPELINE = ["Understand", "Safety", "Validate", "Search", "Plan", "Remember", "Reply"];

export default function Landing() {
  const [authed, setAuthed] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => setAuthed(!!getToken()), []);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % PIPELINE.length), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <Link
          href={authed ? "/dashboard" : "/login"}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08]"
        >
          {authed ? "Open app" : "Sign in"}
        </Link>
      </header>

      {/* Hero */}
      <section className="grid items-center gap-12 pb-20 pt-10 md:grid-cols-[1.1fr_1fr] md:pt-20">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-soft"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Agentic AI · Episodic memory · Goal tracking
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="font-[family-name:var(--font-display)] text-5xl leading-[1.02] tracking-tight text-white md:text-7xl"
          >
            Not a chatbot.
            <br />
            <span className="italic text-gradient">Your crew</span> for better days.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="mt-6 max-w-lg text-base leading-relaxed text-muted md:text-lg"
          >
            AI companions that remember your life, turn wishes into realistic plans, track your habits and nudge you — each in
            their own voice.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-9 flex flex-wrap gap-3"
          >
            <Link
              href={authed ? "/dashboard" : "/login?mode=register"}
              className="group inline-flex h-12 items-center gap-2 rounded-xl btn-gradient px-6 font-medium text-white shadow-[0_10px_40px_-10px_rgba(217,70,239,0.7)]"
            >
              Meet your crew <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <a href="#how" className="inline-flex h-12 items-center rounded-xl border border-white/10 px-6 text-sm text-soft hover:bg-white/[0.04]">
              How it works
            </a>
          </motion.div>
        </div>

        {/* Floating crew cards */}
        <div className="relative h-[420px]">
          {CREW.map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 30, rotate: 0 }}
              animate={{ opacity: 1, y: [0, -8, 0], rotate: [-3, 2, 3][i] }}
              transition={{
                opacity: { delay: 0.25 + i * 0.12 },
                y: { duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.6 },
                rotate: { delay: 0.25 + i * 0.12 },
              }}
              className="glass absolute w-[300px] rounded-3xl p-5 shadow-2xl"
              style={{ top: i * 125, left: [10, 120, 30][i] }}
            >
              <div className={`absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br ${c.from} to-transparent opacity-60`} />
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-2xl ring-1 ${c.ring}`}>{c.emoji}</div>
                <div>
                  <div className="font-semibold text-white">{c.name}</div>
                  <div className="text-xs text-muted">{c.tag}</div>
                </div>
              </div>
              <div className="mt-3 rounded-2xl rounded-tl-md bg-white/[0.06] px-3.5 py-2.5 text-sm text-soft">{c.line}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: i * 0.06 }}
            className="glass group rounded-2xl p-6 transition hover:border-white/15"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/25 to-fuchsia-500/10 ring-1 ring-white/10">
              <f.icon className="h-5 w-5 text-violet-200" />
            </div>
            <div className="font-medium text-white">{f.title}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
          </motion.div>
        ))}
      </section>

      {/* How it works */}
      <section id="how" className="pb-28">
        <h2 className="text-center font-[family-name:var(--font-display)] text-4xl text-white md:text-5xl">
          Every message runs an <span className="italic text-gradient">agent graph</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted">
          LangGraph routes each message through only the steps it needs — then a background graph writes new memories.
        </p>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
          {PIPELINE.map((p, i) => (
            <div key={p} className="flex items-center gap-2">
              <motion.div
                animate={{
                  scale: i === step ? 1.08 : 1,
                  borderColor: i === step ? "rgba(217,70,239,0.6)" : "rgba(255,255,255,0.08)",
                  backgroundColor: i <= step ? "rgba(139,92,246,0.14)" : "rgba(255,255,255,0.02)",
                }}
                className="rounded-xl border px-4 py-2.5 text-sm text-white"
              >
                {p}
              </motion.div>
              {i < PIPELINE.length - 1 && <div className={`h-px w-5 ${i < step ? "bg-fuchsia-400/60" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-muted">
        Conversational Lifestyle & Goal-Tracking AI with Episodic Memory · Minor Project
      </footer>
    </div>
  );
}
