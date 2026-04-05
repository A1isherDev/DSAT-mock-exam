import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function ClassroomPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Single line under title (e.g. schedule). */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "cr-hero flex flex-col gap-6 rounded-2xl border border-border p-6 shadow-sm sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {meta ? <div className="mt-2 text-sm text-muted-foreground">{meta}</div> : null}
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
