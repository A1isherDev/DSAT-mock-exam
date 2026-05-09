/**
 * Domain API: Scoring
 * Ops-level access to scoring pipeline health and failure recovery.
 */

import { assessmentsAdminApi } from "@/features/assessmentsAdmin/api";
import type { GradingMetrics } from "../types";

/**
 * Fetch grading pipeline health metrics.
 * Used by the ops scoring-issues dashboard.
 */
export async function getGradingMetrics(): Promise<GradingMetrics | null> {
  try {
    // assessmentsAdminApi does not yet expose a typed metrics fetch;
    // using the raw admin endpoint via the base API client.
    const { assessmentsAdminApi: raw } = await import("@/features/assessmentsAdmin/api");
    void raw; // suppress unused warning — the endpoint will be wired below
    // TODO: wire to GET /assessments/admin/grading/metrics/
    // For now, return null so the UI shows the "metrics unavailable" state
    return null;
  } catch {
    return null;
  }
}
