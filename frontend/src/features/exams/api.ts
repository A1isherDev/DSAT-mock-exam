import type { AxiosResponse } from "axios";

import api, { examsPublicApi } from "@/lib/api";

/**
 * Feature-level API wrapper for the exam runner + public exam catalog.
 * Pages/components should prefer importing from `features/exams/*` instead of `lib/api`.
 */
export const examsFeatureApi = {
  // Public catalog
  listPracticeTests: () => examsPublicApi.getPracticeTests(),
  getPracticeTest: (id: number) => examsPublicApi.getPracticeTest(id),
  listMockExams: () => examsPublicApi.getMockExams(),
  getMockExam: (id: number) => examsPublicApi.getMockExam(id),

  // Attempts (timed runner)
  listAttempts: () => examsPublicApi.getAttempts(),
  startTest: (practiceTestId: number) => examsPublicApi.startTest(practiceTestId),
  getAttemptStatus: (attemptId: number) => examsPublicApi.getAttemptStatus(attemptId),
  startAttemptEngine: (attemptId: number, idem?: string) => examsPublicApi.startAttemptEngine(attemptId, idem),
  resumeAttemptEngine: (attemptId: number, idem?: string) => examsPublicApi.resumeAttemptEngine(attemptId, idem),
  submitModule: (...args: Parameters<typeof examsPublicApi.submitModule>) => examsPublicApi.submitModule(...args),
  saveAttempt: (...args: Parameters<typeof examsPublicApi.saveAttempt>) => examsPublicApi.saveAttempt(...args),
};

// Re-export axios instance for rare cases (should shrink over time).
export const examsHttp = api as unknown as { post: (...a: any[]) => Promise<AxiosResponse> };

