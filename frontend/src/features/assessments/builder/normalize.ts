import type { AssessmentQuestion } from "@/features/assessments/types";

/**
 * Stable ordering: by `order` asc, then `id` asc.
 * Reassigns contiguous `order` 0..n-1 so UI + drag indices stay consistent with backend expectations.
 */
export function normalizeQuestionList(questions: AssessmentQuestion[]): AssessmentQuestion[] {
  const copy = questions.map((q) => ({ ...q }));
  copy.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || Number(a.id) - Number(b.id));
  return copy.map((q, idx) => ({ ...q, order: idx }));
}
