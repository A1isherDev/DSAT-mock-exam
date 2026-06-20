import { cn } from "@/lib/cn";
import type { QbValidation } from "../types";

const VALIDATION_STYLES: Record<QbValidation, string> = {
  VALID: "bg-emerald-100 text-emerald-800",
  WARNING: "bg-amber-100 text-amber-800",
  ERROR: "bg-rose-100 text-rose-700",
  DUPLICATE: "bg-sky-100 text-sky-800",
};

const VALIDATION_LABELS: Record<QbValidation, string> = {
  VALID: "Valid",
  WARNING: "Warning",
  ERROR: "Error",
  DUPLICATE: "Duplicate",
};

export function CandidateValidationBadge({
  status,
  className,
}: {
  status: QbValidation;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold",
        VALIDATION_STYLES[status],
        className,
      )}
    >
      {VALIDATION_LABELS[status]}
    </span>
  );
}

/** Batch lifecycle label (already humanized server-side as `status_display`). */
export function BatchStatusBadge({ label, className }: { label: string; className?: string }) {
  const tone = label === "Validation Failed"
    ? "bg-rose-100 text-rose-700"
    : label === "Imported"
      ? "bg-emerald-100 text-emerald-800"
      : label === "Ready For Review"
        ? "bg-indigo-100 text-indigo-800"
        : "bg-slate-100 text-slate-700";
  return (
    <span
      className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold", tone, className)}
    >
      {label}
    </span>
  );
}
