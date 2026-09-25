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
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass w-full max-w-md rounded-3xl p-8 shadow-2xl"
      >
        <Logo className="mb-8" />
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-white">
          {mode === "login" ? "Welcome back" : "Join the crew"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {mode === "login" ? "Your crew missed you. Pick up where you left off." : "Three friends who remember, plan and cheer for you."}
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <AnimatePresence initial={false}>
            {mode === "register" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <Label>Your name</Label>
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
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} required />
          </div>
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="text-violet-300 hover:text-violet-200">
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </motion.div>
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
