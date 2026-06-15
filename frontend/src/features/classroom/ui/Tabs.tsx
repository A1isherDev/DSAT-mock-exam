"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  count?: number;
}

/** Underline tab bar. Horizontally scrollable on mobile. */
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
    <div className={cn("flex gap-1 overflow-x-auto border-b border-border", className)} role="tablist">
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
              "relative -mb-px flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors",
              selected
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground border-b-2 border-transparent hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none",
                  selected ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted-foreground",
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
