import type { Subject } from "./types";

export const assessmentsKeys = {
  all: ["assessments"] as const,
  sets: () => [...assessmentsKeys.all, "sets"] as const,
  setsList: (params?: { subject?: Subject; category?: string }) => [...assessmentsKeys.sets(), "list", params ?? {}] as const,
  setDetail: (id: number) => [...assessmentsKeys.sets(), "detail", id] as const,
  attempt: () => [...assessmentsKeys.all, "attempt"] as const,
  attemptBundle: (attemptId: number) => [...assessmentsKeys.attempt(), "bundle", attemptId] as const,
  result: () => [...assessmentsKeys.all, "result"] as const,
  myResult: (assignmentId: number) => [...assessmentsKeys.result(), "my", assignmentId] as const,
};

