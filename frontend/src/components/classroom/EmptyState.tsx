import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ClassroomButton } from "./Button";

export function ClassroomEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "cr-surface flex flex-col items-center justify-center rounded-2xl px-8 py-14 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/15 via-white/40 to-sky-500/15 text-blue-600 ring-1 ring-blue-200/50 dark:from-blue-500/20 dark:via-slate-900/20 dark:to-sky-500/15 dark:text-blue-300 dark:ring-blue-500/25">
          <Icon className="h-8 w-8 opacity-95" strokeWidth={1.5} />
        </div>
      ) : null}
      <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
      {action ? (
        <ClassroomButton variant="primary" size="md" className="mt-6" onClick={action.onClick}>
          {action.label}
        </ClassroomButton>
      ) : null}
    </div>
  );
}
