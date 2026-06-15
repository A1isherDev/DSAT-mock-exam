import { cn } from "@/lib/cn";

export type PillTone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

const tones: Record<PillTone, string> = {
  neutral: "bg-surface-2 text-muted-foreground",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  primary: "bg-primary/10 text-primary",
};

/** Quiet status chip — calmer than the global Badge; for workflow/attendance/ranking states. */
export function Pill({
  tone = "neutral",
  dot,
  className,
  children,
}: {
  tone?: PillTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </span>
  );
}
