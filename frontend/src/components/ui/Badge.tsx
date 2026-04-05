import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant = "brand" | "neutral" | "success" | "warning" | "live";

const variantClass: Record<BadgeVariant, string> = {
  brand:
    "border-blue-200/80 bg-gradient-to-r from-blue-600/10 via-blue-500/8 to-amber-500/15 text-blue-900 dark:border-amber-500/25 dark:from-blue-500/15 dark:via-blue-500/10 dark:to-amber-500/20 dark:text-blue-100",
  neutral:
    "border-slate-200/90 bg-slate-100/90 text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200",
  success:
    "border-emerald-200/80 bg-emerald-50/95 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200",
  warning:
    "border-amber-200/80 bg-amber-50/95 text-amber-950 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-100",
  live:
    "border-sky-200/70 bg-sky-50/90 text-sky-950 dark:border-sky-800/40 dark:bg-sky-950/35 dark:text-sky-200",
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
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      ) : null}
      {children}
    </span>
  );
}
