/**
 * Domain: Scoring
 * Types for attempt scoring, grading metrics, and scoring failure recovery.
 */

/**
 * Scoring pipeline state for a single attempt.
 * Mirrors governance document Part 1.5.
 */
export type AttemptScoringState =
  | "STARTED"
  | "SUBMITTED"
  | "SCORING"
  | "SCORED"
  | "SCORE_FAILED"
  | "REVIEWED"
  | "DISPUTED"
  | "RESOLVED";

/**
 * A failed attempt that needs admin attention.
 */
export type ScoringFailure = {
  attemptId: number;
  assignmentId: number;
  assignmentTitle: string;
  classroomId: number;
  classroomName: string;
  studentName: string;
  submittedAt: string;
  failedAt: string;
  retryCount: number;
  errorDetail?: string;
};

/**
 * Grading pipeline health metrics for the ops dashboard.
 */
export type GradingMetrics = {
  pendingScoring: number;
  failedScoring: number;
  averageScoringLatencyMs: number | null;
  lastUpdatedAt: string;
};
