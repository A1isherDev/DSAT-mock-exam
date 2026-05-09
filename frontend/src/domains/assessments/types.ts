/**
 * Domain: Assessments
 * Canonical type definitions for the assessment authoring domain.
 *
 * "Assessment" here means AssessmentSet + its published versions.
 * This is distinct from the older "exam" concept (practice tests, mock exams)
 * which live in the exams/* backend app.
 */

import type { AssessmentSet, Subject } from "@/features/assessments/types";

export type { AssessmentSet, Subject };

/**
 * Assessment set lifecycle state.
 * Mirrors the system governance document Part 1.2.
 */
export type AssessmentSetState = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/**
 * A published snapshot of an assessment set.
 * Immutable after creation — see governance invariant INV-002.
 *
 * @note Full snapshot architecture is not yet deployed. This type
 *       represents the target model, not the current backend state.
 *       Current backend has AssessmentSet with is_active flag only.
 */
export type AssessmentSetVersion = {
  id: number;
  setId: number;
  versionNumber: number;
  state: "PENDING" | "PUBLISHED" | "SUPERSEDED" | "ABANDONED";
  publishedAt: string | null;
  publishedBy: number | null;
  snapshotChecksum: string | null;
  gradingEngineVersion: string;
  questionCount: number;
};

/**
 * Filters for the assessment set list.
 */
export type AssessmentSetFilters = {
  subject?: Subject | "all";
  category?: string | "all";
  isActive?: boolean | "all";
  search?: string;
};
