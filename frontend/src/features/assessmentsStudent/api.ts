import api from "@/lib/api";

import type { Attempt, AttemptAnswerRequest, AttemptStartRequest, AttemptSubmitRequest, Result } from "@/features/assessments/types";
import { AssessmentAttemptBundleSchema, AssessmentAttemptSchema } from "@/features/assessments/schemas";

/**
 * Student assessments surface: attempt lifecycle + results.
 */
export const assessmentsStudentApi = {
  start: async (payload: AttemptStartRequest): Promise<Attempt> => {
    const r = await api.post("/assessments/attempts/start/", payload);
    return AssessmentAttemptSchema.parse(r.data) as Attempt;
  },
  bundle: async (attemptId: number): Promise<{ attempt: Attempt; set: unknown; questions: unknown[] }> => {
    const r = await api.get(`/assessments/attempts/${attemptId}/bundle/`);
    return AssessmentAttemptBundleSchema.parse(r.data) as any;
  },
  saveAnswer: async (payload: AttemptAnswerRequest): Promise<Attempt> => {
    const r = await api.post("/assessments/attempts/answer/", payload);
    return AssessmentAttemptSchema.parse(r.data) as Attempt;
  },
  submit: async (payload: AttemptSubmitRequest): Promise<Attempt> => {
    const r = await api.post("/assessments/attempts/submit/", payload);
    return AssessmentAttemptSchema.parse(r.data) as Attempt;
  },
  myResult: async (assignmentId: number): Promise<Result> => {
    const r = await api.get(`/assessments/homework/${assignmentId}/my-result/`);
    return r.data as Result;
  },
};

