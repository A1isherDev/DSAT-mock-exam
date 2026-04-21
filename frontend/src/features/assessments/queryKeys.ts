import type { Subject } from "./types";

export const assessmentKeys = {
  all: ["assessments"] as const,
  sets: () => [...assessmentKeys.all, "sets"] as const,
  setsList: (params?: { subject?: Subject; category?: string }) => [...assessmentKeys.sets(), "list", params ?? {}] as const,
  setDetail: (id: number) => [...assessmentKeys.sets(), "detail", id] as const,
  attempt: () => [...assessmentKeys.all, "attempt"] as const,
  attemptBundle: (attemptId: number) => [...assessmentKeys.attempt(), "bundle", attemptId] as const,
  result: () => [...assessmentKeys.all, "result"] as const,
  myResult: (assignmentId: number) => [...assessmentKeys.result(), "my", assignmentId] as const,
};

