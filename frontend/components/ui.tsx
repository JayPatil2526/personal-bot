"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import * as React from "react";
import { cn, colorOf } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const variants = {
    primary: "bg-ink text-white hover:bg-[#2c2f47]",
    secondary: "border border-line-strong bg-white text-ink hover:bg-subtle",
    ghost: "text-ink-2 hover:bg-subtle hover:text-ink",
    danger: "border border-rose-line bg-rose-soft text-rose hover:bg-[#fbe2e8]",
  };
  const sizes = { sm: "h-8 px-3.5 text-[13px]", md: "h-10 px-5 text-sm", lg: "h-12 px-7 text-[15px]" };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card", className)} {...props}>
      {children}
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}>
      {children}
    </span>
  );
}

const fieldBase =
  "w-full rounded-xl border border-line-strong bg-white text-sm text-ink placeholder:text-muted outline-none transition focus:border-ink/40 focus:ring-4 focus:ring-ink/5";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-11 px-3.5", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldBase, "px-3.5 py-3", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-ink-2">
      {children}
      {hint && <span className="font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  const id = React.useId();
  return (
    <div className="inline-flex rounded-full border border-line bg-subtle p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("relative rounded-full px-3.5 py-1.5 text-[13px] transition-colors", value === o.value ? "text-ink" : "text-muted hover:text-ink-2")}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full border border-line bg-white shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn("scroll-thin relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-white p-7 shadow-2xl shadow-ink/10", className)}
          >
            <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-1.5 text-muted hover:bg-subtle hover:text-ink">
              <X className="h-4 w-4" />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ProgressRing({
  value,
  size = 64,
  stroke = 5,
  color = "#1e2033",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#ececf1" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (v / 100) * c }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, className, color = "#1e2033" }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[#ececf1]", className)}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/** Monogram avatar: first letter on the character's soft tint. */
export function Avatar({ name, color, size = "md", className }: { name: string; color?: string; size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }) {
  const c = colorOf(color);
  const sizes = { xs: "h-6 w-6 text-[11px]", sm: "h-8 w-8 text-[13px]", md: "h-10 w-10 text-[15px]", lg: "h-12 w-12 text-lg", xl: "h-16 w-16 text-2xl" };
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-full border font-semibold", c.soft, c.line, c.text, sizes[size], className)}>
      {name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

export function CrewStack({ crew, size = "sm" }: { crew: { name: string; color: string }[]; size?: "xs" | "sm" | "md" }) {
  return (
    <div className="flex -space-x-2">
      {crew.map((c) => (
        <Avatar key={c.name} name={c.name} color={c.color} size={size} className="ring-2 ring-white" />
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-2xl", className)} />;
}

export function Empty({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-subtle text-ink-2">{icon}</div>}
      <div className="font-medium text-ink">{title}</div>
      {text && <p className="max-w-sm text-sm leading-relaxed text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: React.ReactNode; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
        <h1 className="headline text-[34px] md:text-[44px]">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1.5 text-[30px] font-medium leading-none tracking-tight text-ink tabular-nums">{value}</div>
      {sub && <div className="mt-2 text-[12px] text-muted">{sub}</div>}
    </Card>
  );
}

export const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } }),
};

export const chartTooltip = {
  contentStyle: { background: "#fff", border: "1px solid #e8e8ee", borderRadius: 12, fontSize: 12, boxShadow: "0 8px 24px rgba(30,32,51,0.08)" },
  cursor: { fill: "rgba(30,32,51,0.04)" },
};
