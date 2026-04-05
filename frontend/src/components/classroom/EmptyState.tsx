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
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-card/60 to-accent-cyan/12 text-primary ring-1 ring-border">
          <Icon className="h-8 w-8 opacity-95" strokeWidth={1.5} />
        </div>
      ) : null}
      <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action ? (
        <ClassroomButton variant="primary" size="md" className="mt-6" onClick={action.onClick}>
          {action.label}
        </ClassroomButton>
      ) : null}
    </div>
  );
}
