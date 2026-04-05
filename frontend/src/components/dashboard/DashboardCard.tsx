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
      ? "hover:shadow-[0_0_28px_color-mix(in_srgb,var(--primary)_14%,transparent)] hover:border-primary/25"
      : accent === "gold"
        ? "hover:shadow-[0_0_24px_color-mix(in_srgb,var(--ds-gold)_12%,transparent)] hover:border-amber-500/35"
        : "hover:border-border hover:shadow-[0_12px_40px_-12px_color-mix(in_srgb,var(--foreground)_8%,transparent)]";

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-md backdrop-blur-sm",
        accent === "gold" ? "border-amber-500/30" : "",
        "shadow-[0_4px_24px_-4px_color-mix(in_srgb,var(--foreground)_6%,transparent)] dark:shadow-[0_8px_32px_-8px_color-mix(in_srgb,var(--primary)_14%,transparent)]",
        "transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        interactive && "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg",
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
    <h2 className={cn("text-lg font-bold tracking-tight text-foreground md:text-xl", className)}>
      {children}
    </h2>
  );
}
