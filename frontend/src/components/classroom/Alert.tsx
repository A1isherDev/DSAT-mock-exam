import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export type ClassroomAlertTone = "error" | "warning" | "info";

const toneClass: Record<ClassroomAlertTone, string> = {
  error: "border-red-200/90 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
  warning:
    "border-amber-200/90 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100",
  info: "border-slate-200/90 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200",
};

export function ClassroomAlert({
  tone,
  children,
  className,
  title,
}: {
  tone: ClassroomAlertTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={cn("rounded-xl border px-4 py-3 text-sm font-medium", toneClass[tone], className)}
      role={tone === "error" ? "alert" : "status"}
    >
      {title ? <p className="font-bold mb-1">{title}</p> : null}
      {children}
    </div>
  );
}
