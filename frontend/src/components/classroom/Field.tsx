import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export type ClassroomFieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
};

export function ClassroomField({ label, htmlFor, hint, error, children, className }: ClassroomFieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={htmlFor}
        className="ds-section-title text-slate-500 dark:text-slate-400"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="rounded-lg border border-red-200/80 bg-red-50/90 px-2.5 py-1.5 text-xs font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-200" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="ds-caption text-slate-400 dark:text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
