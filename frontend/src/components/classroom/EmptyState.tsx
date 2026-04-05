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
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 text-indigo-600 dark:text-indigo-400">
          <Icon className="h-7 w-7 opacity-90" strokeWidth={1.5} />
        </div>
      ) : null}
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
      {action ? (
        <ClassroomButton variant="primary" size="md" className="mt-6" onClick={action.onClick}>
          {action.label}
        </ClassroomButton>
      ) : null}
    </div>
  );
}
