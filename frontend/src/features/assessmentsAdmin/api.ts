import api, { assessmentsAdminApi as assessmentsAdminClient } from "@/lib/api";

import type {
  AssessmentQuestion,
  AssessmentSet,
  HomeworkAssignmentCreateRequest,
  Subject,
} from "@/features/assessments/types";

/**
 * Staff assessments surface: authoring + homework assignment.
 */
export const assessmentsAdminApi = {
  // Authoring CRUD
  listSets: async (params?: { subject?: Subject; category?: string }): Promise<AssessmentSet[]> => {
    const data = await assessmentsAdminClient.adminListSets(params);
    return Array.isArray(data) ? (data as AssessmentSet[]) : [];
  },
  getSet: async (id: number): Promise<AssessmentSet> => {
    return (await assessmentsAdminClient.adminGetSet(id)) as AssessmentSet;
  },
  createSet: async (payload: {
    subject: Subject;
    category?: string;
    title: string;
    description?: string;
    is_active?: boolean;
  }): Promise<AssessmentSet> => {
    return (await assessmentsAdminClient.adminCreateSet(payload)) as AssessmentSet;
  },
  updateSet: async (id: number, payload: Partial<Omit<AssessmentSet, "id">>): Promise<AssessmentSet> => {
    return (await assessmentsAdminClient.adminUpdateSet(id, payload as any)) as AssessmentSet;
  },
  createQuestion: async (
    setId: number,
    payload: Partial<AssessmentQuestion> & { prompt: string; question_type: string },
  ) => {
    return (await assessmentsAdminClient.adminCreateQuestion(setId, payload as any)) as AssessmentQuestion;
  },
  updateQuestion: async (id: number, payload: Partial<AssessmentQuestion>) => {
    return (await assessmentsAdminClient.adminUpdateQuestion(id, payload as any)) as AssessmentQuestion;
  },
  deleteQuestion: async (id: number) => {
    await assessmentsAdminClient.adminDeleteQuestion(id);
  },
  telemetry: async (key: string) => {
    await api.post("/assessments/admin/builder/telemetry/", { key });
  },

  // Homework assign (teacher/staff)
  assign: async (payload: HomeworkAssignmentCreateRequest, idempotencyKey?: string) => {
    const r = await api.post("/assessments/homework/assign/", payload, {
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    });
    return r.data;
  },
};

