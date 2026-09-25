"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/AppShell";
import { Button, Input, Label } from "@/components/ui";
import { api, setAuth } from "@/lib/api";

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">(params.get("mode") === "register" ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
      const res = await api<{ access_token: string; user: unknown }>(`/auth/${mode}`, {
        method: "POST",
        json: mode === "register" ? { name, email, password, timezone: tz } : { email, password },
      });
      setAuth(res.access_token, res.user);
      router.replace(mode === "register" ? "/crew?welcome=1" : "/dashboard");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col justify-between px-6 py-8 md:px-16">
        <Logo />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-sm py-12">
          <h1 className="headline text-[36px]">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-3 text-[15px] text-ink-2">
            {mode === "login" ? "Your crew kept track while you were away." : "Meet Arjun, Meera and Kabir — they'll remember the rest."}
          </p>
          <form onSubmit={submit} className="mt-9 space-y-4">
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jay Patil" required />
                </motion.div>
              )}
            </AnimatePresence>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required />
            </div>
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {mode === "login" ? "Log in" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="font-medium text-ink underline underline-offset-4">
              {mode === "login" ? "Create an account" : "Log in"}
            </button>
          </p>
        </motion.div>
        <p className="text-xs text-muted">Minor project · Conversational Lifestyle & Goal-Tracking AI</p>
      </div>
      <div className="relative hidden overflow-hidden border-l border-line md:block">
        <div className="dots absolute inset-0" />
        <div className="relative flex h-full flex-col justify-center gap-4 p-16">
          {[
            { n: "Arjun", c: "#e8590c", bg: "#fff3ea", b: "#fbd7bf", t: "You said you'd walk after dinner yesterday. Did you? 👀" },
            { n: "Meera", c: "#4d7c2a", bg: "#eef5e6", b: "#cfe3bb", t: "Arjun told me about the walk — no pressure, small steps still count." },
            { n: "Kabir", c: "#4f5bd5", bg: "#eef0fd", b: "#cdd2f8", t: "Your weekly report is in: 86% of habits done, up from 83%. 📈" },
          ].map((m, i) => (
            <motion.div
              key={m.n}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.2 }}
              className="max-w-sm rounded-2xl border px-4 py-3 text-[14px] text-ink shadow-sm"
              style={{ background: m.bg, borderColor: m.b, marginLeft: i * 28 }}
            >
              <div className="mb-0.5 text-[11px] font-semibold" style={{ color: m.c }}>
                {m.n}
              </div>
              {m.t}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
