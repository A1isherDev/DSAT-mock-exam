import { Pill, type PillTone } from "../ui/Pill";
import type { SubmissionStatus } from "../types";

/**
 * Submission status → student-facing label. Growth-oriented only: no
 * "Overdue/Failed/Late" — see memory growth-oriented-language.
 */
const MAP: Record<string, { label: string; tone: PillTone }> = {
  DRAFT: { label: "In progress", tone: "neutral" },
  SUBMITTED: { label: "Submitted", tone: "info" },
  RETURNED: { label: "Revise & resubmit", tone: "warning" },
  REVIEWED: { label: "Graded", tone: "success" },
};

export function SubmissionStatusPill({ status }: { status?: SubmissionStatus | string | null }) {
  const cfg = (status && MAP[status]) || { label: "To do", tone: "neutral" as PillTone };
  return <Pill tone={cfg.tone}>{cfg.label}</Pill>;
}
