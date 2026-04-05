import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

const padMap = { none: "", sm: "p-4", md: "p-5 md:p-6", lg: "p-7 md:p-8" };

export type DashboardAccent = "purple" | "cyan" | "neutral";

/**
 * Premium LMS card: lift + controlled neon glow on hover (dark), soft shadow (light).
 */
export function DashboardCard({
  children,
  className,
  padding = "md",
  interactive = false,
  accent = "purple",
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: keyof typeof padMap;
  interactive?: boolean;
  accent?: DashboardAccent;
}) {
  const glow =
    accent === "cyan"
      ? "dark:hover:shadow-[0_20px_48px_-12px_rgba(34,211,238,0.22)] dark:hover:border-cyan-400/35"
      : accent === "purple"
        ? "dark:hover:shadow-[0_20px_48px_-12px_rgba(168,85,247,0.22)] dark:hover:border-fuchsia-500/35"
        : "dark:hover:border-white/15";

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/90 bg-white/95 shadow-md shadow-slate-900/[0.04]",
        "dark:border-white/[0.07] dark:bg-gradient-to-br dark:from-[#13151f] dark:to-[#0b0c12] dark:shadow-black/50",
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
        "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-cyan-400/85",
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
