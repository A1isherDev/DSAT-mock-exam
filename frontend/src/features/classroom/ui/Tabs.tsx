"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  count?: number;
}

/** Pill tab bar (1:1 with the Classroom mockup). Horizontally scrollable on mobile. */
export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2.5 overflow-x-auto pb-0.5", className)} role="tablist">
      {items.map((t) => {
        const selected = t.id === active;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border-[1.5px] px-4 py-2.5 text-sm font-extrabold transition-all active:scale-95",
              selected
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:border-primary hover:bg-primary-soft hover:text-primary",
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-extrabold leading-none",
                  selected ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
