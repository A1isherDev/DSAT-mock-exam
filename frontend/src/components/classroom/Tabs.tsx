import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";

export type ClassroomTabItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
};

export function ClassroomTabs({
  items,
  value,
  onChange,
  className,
  ariaLabel = "Section navigation",
}: {
  items: ClassroomTabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex flex-wrap gap-2 rounded-2xl border border-slate-200/60 bg-slate-50/80 p-1.5 dark:border-slate-700/60 dark:bg-slate-900/40",
        className,
      )}
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            id={`classroom-tab-${id}`}
            aria-controls={`classroom-panel-${id}`}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900",
              active
                ? "bg-white text-blue-900 shadow-sm dark:bg-slate-800 dark:text-blue-200"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100",
            )}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-85" strokeWidth={2} /> : null}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
