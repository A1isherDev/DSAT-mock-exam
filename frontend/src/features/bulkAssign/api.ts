import { assessmentsAdminApi, classesApi, examsAdminApi } from "@/lib/api";

/**
 * Bulk-assign is an operationally critical flow. Centralize its API surface here so we can:
 * - enforce correct endpoints (admin vs public)
 * - add idempotency defaults
 * - add response-shape guards (results vs array)
 * without touching many UI components.
 */
export const bulkAssignApi = {
  exams: examsAdminApi,
  assessments: assessmentsAdminApi,
  classes: classesApi,
};

