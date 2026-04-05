import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant = "brand" | "neutral" | "success" | "warning" | "live";

const variantClass: Record<BadgeVariant, string> = {
  brand:
    "border-primary/30 bg-gradient-to-r from-primary/12 via-primary/8 to-amber-500/15 text-foreground",
  neutral: "border-border bg-surface-2 text-muted-foreground",
  success:
    "border-emerald-500/35 bg-emerald-500/10 text-foreground dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-100",
  warning:
    "border-amber-500/35 bg-amber-500/10 text-foreground dark:border-amber-400/28 dark:bg-amber-500/12 dark:text-amber-100",
  live:
    "border-accent-cyan/35 bg-accent-cyan/10 text-foreground dark:border-accent-cyan/30 dark:bg-accent-cyan/12 dark:text-accent-cyan",
};

export function Badge({
  children,
  variant = "neutral",
  className,
  dot,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: BadgeVariant;
  /** Pulsing status dot */
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        variantClass[variant],
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-50" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
      ) : null}
      {children}
    </span>
  );
}
