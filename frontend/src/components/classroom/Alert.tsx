import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export type ClassroomAlertTone = "error" | "warning" | "info";

const toneClass: Record<ClassroomAlertTone, string> = {
  error:
    "border-red-200/90 bg-gradient-to-r from-red-50 to-orange-50/30 text-red-900 dark:border-red-900/50 dark:from-red-950/40 dark:to-red-950/20 dark:text-red-100",
  warning:
    "border-amber-200/90 bg-gradient-to-r from-amber-50 to-yellow-50/20 text-amber-950 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-amber-950/15 dark:text-amber-100",
  info: "border-blue-200/80 bg-gradient-to-r from-blue-50/90 to-sky-50/40 text-slate-800 dark:border-blue-500/25 dark:from-blue-950/30 dark:to-sky-950/20 dark:text-slate-200",
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
      className={cn(
        "rounded-xl border px-4 py-3 text-sm font-medium shadow-sm transition-shadow duration-200",
        toneClass[tone],
        className,
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      {title ? <p className="font-bold mb-1">{title}</p> : null}
      {children}
    </div>
  );
}
