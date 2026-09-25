"use client";

import { motion } from "framer-motion";
import { Brain, Code2, LayoutDashboard, LogOut, MessageCircle, Target, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAuth, getStoredUser, getToken } from "@/lib/api";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/crew", label: "Crew", icon: Users },
  { href: "/developer", label: "Developer", icon: Code2 },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2.5", className)}>
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl btn-gradient shadow-[0_0_24px_-4px_rgba(217,70,239,0.6)]">
        <span className="text-lg">✦</span>
      </div>
      <span className="text-[17px] font-semibold tracking-tight text-white">
        Life<span className="text-gradient">Crew</span>
      </span>
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getStoredUser<User>());
    setReady(true);
  }, [router]);

  if (!ready) return null;

  const logout = () => {
    clearAuth();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.06] bg-black/20 px-3 py-5 backdrop-blur-xl md:flex">
        <Logo className="px-2" />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                  active ? "text-white" : "text-muted hover:bg-white/[0.04] hover:text-soft",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl border border-white/10 bg-white/[0.06]"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
                <Icon className="relative h-4 w-4" />
                <span className="relative">{label}</span>
                {label === "Developer" && (
                  <span className="relative ml-auto rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-muted">DEV</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/40 to-fuchsia-500/40 text-sm font-semibold">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user?.name}</div>
            <div className="truncate text-[11px] text-muted">{user?.email}</div>
          </div>
          <button onClick={logout} title="Log out" className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-1 overflow-x-auto border-b border-white/[0.06] bg-black/60 px-3 py-2 backdrop-blur-xl md:hidden">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs",
              pathname.startsWith(href) ? "bg-white/10 text-white" : "text-muted",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        ))}
      </div>

      <main className="min-w-0 flex-1 pt-12 md:pt-0">{children}</main>
    </div>
  );
}
