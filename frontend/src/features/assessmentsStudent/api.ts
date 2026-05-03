import api from "@/lib/api";

import type { components } from "@/lib/openapi-types";
import type { AttemptAnswerRequest, AttemptStartRequest, AttemptSubmitRequest, Attempt } from "@/features/assessments/types";
import type { SaveAnswerResponse, SubmitResponse } from "@/features/assessments/schemas";

type AssessmentAttemptBundleResponse = components["schemas"]["AssessmentAttemptBundleResponse"];
type AssessmentMyResultResponse = components["schemas"]["AssessmentMyResultResponse"];

/**
 * Student assessments surface: attempt lifecycle + results.
 * Shapes match `backend/openapi.yaml` (see `npm run gen:openapi`).
 */
export const assessmentsStudentApi = {
  start: async (payload: AttemptStartRequest): Promise<Attempt> => {
    const r = await api.post("/assessments/attempts/start/", payload);
    return r.data as Attempt;
  },
  bundle: async (attemptId: number): Promise<AssessmentAttemptBundleResponse> => {
    const r = await api.get(`/assessments/attempts/${attemptId}/bundle/`);
    return r.data as AssessmentAttemptBundleResponse;
  },
  saveAnswer: async (payload: AttemptAnswerRequest): Promise<SaveAnswerResponse> => {
    const r = await api.post("/assessments/attempts/answer/", payload);
    return r.data as SaveAnswerResponse;
  },
  submit: async (payload: AttemptSubmitRequest): Promise<SubmitResponse> => {
    const r = await api.post("/assessments/attempts/submit/", payload);
    return r.data as SubmitResponse;
  },
  myResult: async (assignmentId: number): Promise<AssessmentMyResultResponse> => {
    const r = await api.get(`/assessments/homework/${assignmentId}/my-result/`);
    return r.data as AssessmentMyResultResponse;
  },
};
