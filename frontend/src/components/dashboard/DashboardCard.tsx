import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

const padMap = { none: "", sm: "p-4", md: "p-5 md:p-6", lg: "p-7 md:p-8" };

export type DashboardAccent = "blue" | "neutral" | "gold";

/**
 * Dashboard card: blue / white / black + optional gold premium hover.
 */
export function DashboardCard({
  children,
  className,
  padding = "md",
  interactive = false,
  accent = "blue",
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: keyof typeof padMap;
  interactive?: boolean;
  accent?: DashboardAccent;
}) {
  const glow =
    accent === "blue"
      ? "dark:hover:shadow-[0_20px_48px_-12px_rgba(59,130,246,0.18),0_16px_40px_-14px_rgba(245,158,11,0.12)] dark:hover:border-blue-500/35"
      : accent === "gold"
        ? "dark:hover:shadow-[0_20px_48px_-12px_rgba(245,158,11,0.15)] dark:hover:border-amber-500/35"
        : "dark:hover:border-white/15";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white shadow-md shadow-slate-900/[0.04]",
        accent === "gold" ? "border-amber-200/55 dark:border-amber-500/25" : "border-slate-200/90 dark:border-white/10",
        "dark:bg-neutral-950 dark:shadow-black/60",
        "transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        interactive &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-slate-300/90 hover:shadow-lg dark:hover:-translate-y-0.5",
        interactive && glow,
        padMap[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function DashboardEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[10px] font-bold uppercase tracking-[0.2em] text-amber-800/90 dark:text-amber-400/90",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function DashboardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-lg font-bold tracking-tight text-slate-900 dark:text-white md:text-xl", className)}>
      {children}
    </h2>
  );
}
