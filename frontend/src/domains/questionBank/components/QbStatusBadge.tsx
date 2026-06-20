import { cn } from "@/lib/cn";
import type { QbStatus } from "../types";
import { STATUS_LABELS } from "../utils";

const STATUS_STYLES: Record<QbStatus, string> = {
  IMPORTED: "bg-slate-100 text-slate-700",
  TRIAGE: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-700",
  ARCHIVED: "bg-zinc-100 text-zinc-500",
};

export function QbStatusBadge({ status, className }: { status: QbStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold",
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
