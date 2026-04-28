import api, { assessmentsApi } from "@/lib/api";

import type {
  AssessmentSet,
  AssessmentQuestion,
  Attempt,
  AttemptAnswerRequest,
  AttemptStartRequest,
  AttemptSubmitRequest,
  HomeworkAssignmentCreateRequest,
  Result,
  Subject,
} from "./types";

export const assessmentAuthoringApi = {
  listSets: async (params?: { subject?: Subject; category?: string }): Promise<AssessmentSet[]> => {
    const data = await assessmentsApi.adminListSets(params);
    return Array.isArray(data) ? (data as AssessmentSet[]) : [];
  },
  getSet: async (id: number): Promise<AssessmentSet> => {
    return (await assessmentsApi.adminGetSet(id)) as AssessmentSet;
  },
  createSet: async (payload: {
    subject: Subject;
    category?: string;
    title: string;
    description?: string;
    is_active?: boolean;
  }): Promise<AssessmentSet> => {
    return (await assessmentsApi.adminCreateSet(payload)) as AssessmentSet;
  },
  updateSet: async (id: number, payload: Partial<Omit<AssessmentSet, "id">>): Promise<AssessmentSet> => {
    return (await assessmentsApi.adminUpdateSet(id, payload as any)) as AssessmentSet;
  },
  createQuestion: async (setId: number, payload: Partial<AssessmentQuestion> & { prompt: string; question_type: string }) => {
    return (await assessmentsApi.adminCreateQuestion(setId, payload as any)) as AssessmentQuestion;
  },
  updateQuestion: async (id: number, payload: Partial<AssessmentQuestion>) => {
    return (await assessmentsApi.adminUpdateQuestion(id, payload as any)) as AssessmentQuestion;
  },
  deleteQuestion: async (id: number) => {
    await assessmentsApi.adminDeleteQuestion(id);
  },
  telemetry: async (key: string) => {
    await api.post("/assessments/admin/builder/telemetry/", { key });
  },
};

export const assessmentHomeworkApi = {
  assign: async (payload: HomeworkAssignmentCreateRequest, idempotencyKey?: string) => {
    const r = await api.post("/assessments/homework/assign/", payload, {
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    });
    return r.data;
  },
};

export const assessmentAttemptApi = {
  start: async (payload: AttemptStartRequest): Promise<Attempt> => {
    const r = await api.post("/assessments/attempts/start/", payload);
    return r.data as Attempt;
  },
  bundle: async (attemptId: number): Promise<{ attempt: Attempt; set: any; questions: any[] }> => {
    const r = await api.get(`/assessments/attempts/${attemptId}/bundle/`);
    return r.data as any;
  },
  saveAnswer: async (payload: AttemptAnswerRequest): Promise<Attempt> => {
    const r = await api.post("/assessments/attempts/answer/", payload);
    return r.data as Attempt;
  },
  submit: async (payload: AttemptSubmitRequest): Promise<Attempt> => {
    const r = await api.post("/assessments/attempts/submit/", payload);
    return r.data as Attempt;
  },
  myResult: async (assignmentId: number): Promise<Result> => {
    const r = await api.get(`/assessments/homework/${assignmentId}/my-result/`);
    return r.data as Result;
  },
};

