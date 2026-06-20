/** Question Bank display helpers and media URL resolution. */
import type { QbDifficulty, QbQuestionType, QbStatus } from "./types";

/** Resolve a possibly-relative media path against the API origin. */
export function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "";
  return `${base}${path}`;
}

export const STATUS_LABELS: Record<QbStatus, string> = {
  IMPORTED: "Imported",
  TRIAGE: "In triage",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
  "": "—",
};

export const QUESTION_TYPE_LABELS: Record<QbQuestionType, string> = {
  MULTIPLE_CHOICE: "Multiple choice",
  STUDENT_PRODUCED: "Grid-in",
  SHORT_TEXT: "Short text",
  NUMERIC: "Numeric",
  BOOLEAN: "True/False",
};

export function difficultyLabel(d: QbDifficulty | string | null): string {
  if (!d) return "—";
  return DIFFICULTY_LABELS[d] ?? d;
}

/** Compact, dependency-free correct-answer rendering. */
export function formatCorrectAnswer(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
