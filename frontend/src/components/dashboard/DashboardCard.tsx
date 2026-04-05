import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

const padMap = { none: "", sm: "p-4", md: "p-5 md:p-6", lg: "p-7 md:p-8" };

export type DashboardAccent = "blue" | "neutral";

/**
 * Dashboard card: blue/white/black system; subtle lift + blue glow on hover (dark).
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
      ? "dark:hover:shadow-[0_20px_48px_-12px_rgba(59,130,246,0.2)] dark:hover:border-blue-500/35"
      : "dark:hover:border-white/15";

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-900/[0.04]",
        "dark:border-white/10 dark:bg-neutral-950 dark:shadow-black/60",
        "transition-all duration-200 ease-out",
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
        "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-blue-400/90",
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
