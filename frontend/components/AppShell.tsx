"use client";

import { motion } from "framer-motion";
import { BarChart3, Brain, Code2, Handshake, Home, LogOut, MessageCircle, Target, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAuth, getStoredUser, getToken } from "@/lib/api";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Today", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/promises", label: "Promises", icon: Handshake },
  { href: "/insights", label: "Weekly report", icon: BarChart3 },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/crew", label: "Crew", icon: Users },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2", className)}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle cx="7" cy="11" r="5" fill="#e8590c" />
        <circle cx="15" cy="11" r="5" fill="#4f5bd5" fillOpacity="0.85" />
        <circle cx="11" cy="6" r="3.2" fill="#4d7c2a" fillOpacity="0.9" />
      </svg>
      <span className="text-[19px] font-semibold tracking-[-0.04em] text-ink">lifecrew</span>
    </Link>
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn("relative flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition-colors", active ? "text-ink" : "text-ink-2 hover:bg-subtle hover:text-ink")}
    >
      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-subtle" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
      <Icon className="relative h-[17px] w-[17px]" strokeWidth={active ? 2.2 : 1.8} />
      <span className={cn("relative", active && "font-medium")}>{label}</span>
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

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-line bg-white px-3 py-5 md:flex">
        <Logo className="px-3" />
        <nav className="mt-8 flex flex-1 flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink key={n.href} {...n} active={isActive(n.href)} />
          ))}
          <div className="my-3 border-t border-line" />
          <NavLink href="/developer" label="Developer" icon={Code2} active={isActive("/developer")} />
        </nav>
        <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-ink">{user?.name}</div>
            <div className="truncate text-[11px] text-muted">{user?.email}</div>
          </div>
          <button
            onClick={() => {
              clearAuth();
              router.replace("/login");
            }}
            title="Log out"
            className="rounded-full p-1.5 text-muted hover:bg-subtle hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="fixed inset-x-0 top-0 z-40 flex items-center gap-1 overflow-x-auto border-b border-line bg-white/90 px-3 py-2 backdrop-blur md:hidden">
        {[...NAV, { href: "/developer", label: "Dev", icon: Code2 }].map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href} className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs", isActive(href) ? "bg-ink text-white" : "text-ink-2")}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        ))}
      </div>

      <main className="min-w-0 flex-1 pt-12 md:pt-0">{children}</main>
    </div>
  );
}
