/**
 * Domain API: Question Bank (admin). Thin wrapper over the axios client.
 * All callers should use this module / the hooks, not @/lib/api directly.
 */
import api from "@/lib/api";
import type {
  QbBulkInput,
  QbBulkResult,
  QbClassifyInput,
  QbDomain,
  QbImportBatch,
  QbImportCandidate,
  QbPaginated,
  QbQuestionDetail,
  QbQuestionFilters,
  QbQuestionListItem,
  QbSkill,
  QbValidation,
  QbVersion,
} from "./types";

const BASE = "/questionbank";

/** Drop empty/undefined params so we never send `?domain=` etc. */
function clean(params?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

export const questionBankApi = {
  // ── Read ──────────────────────────────────────────────────────────────────
  listQuestions: async (filters?: QbQuestionFilters): Promise<QbPaginated<QbQuestionListItem>> => {
    const r = await api.get(`${BASE}/questions/`, { params: clean(filters as Record<string, unknown>) });
    return r.data;
  },
  getQuestion: async (id: number): Promise<QbQuestionDetail> => {
    const r = await api.get(`${BASE}/questions/${id}/`);
    return r.data;
  },
  listVersions: async (questionId: number, includeSnapshot = false): Promise<QbPaginated<QbVersion>> => {
    const r = await api.get(`${BASE}/versions/`, {
      params: clean({ bank_question: questionId, include_snapshot: includeSnapshot ? "true" : undefined }),
    });
    return r.data;
  },
  listDomains: async (subject?: string): Promise<QbDomain[]> => {
    const r = await api.get(`${BASE}/domains/`, { params: clean({ subject }) });
    return r.data;
  },
  listSkills: async (params?: { domain?: number; subject?: string }): Promise<QbSkill[]> => {
    const r = await api.get(`${BASE}/skills/`, { params: clean(params as Record<string, unknown>) });
    return r.data;
  },

  // ── Triage writes ─────────────────────────────────────────────────────────
  classify: async (id: number, payload: QbClassifyInput): Promise<QbQuestionDetail> => {
    const r = await api.post(`${BASE}/questions/${id}/classify/`, payload);
    return r.data;
  },
  approve: async (id: number): Promise<QbQuestionDetail> => {
    const r = await api.post(`${BASE}/questions/${id}/approve/`);
    return r.data;
  },
  reject: async (id: number, reason = ""): Promise<QbQuestionDetail> => {
    const r = await api.post(`${BASE}/questions/${id}/reject/`, { reason });
    return r.data;
  },
  acceptSuggestion: async (id: number): Promise<QbQuestionDetail> => {
    const r = await api.post(`${BASE}/questions/${id}/accept-suggestion/`);
    return r.data;
  },
  bulk: async (payload: QbBulkInput): Promise<{ action: string; results: QbBulkResult[] }> => {
    const r = await api.post(`${BASE}/questions/bulk/`, payload);
    return r.data;
  },

  // ── Import batches ────────────────────────────────────────────────────────
  listBatches: async (status?: string): Promise<QbPaginated<QbImportBatch>> => {
    const r = await api.get(`${BASE}/import-batches/`, { params: clean({ status }) });
    return r.data;
  },
  getBatch: async (id: number): Promise<QbImportBatch> => {
    const r = await api.get(`${BASE}/import-batches/${id}/`);
    return r.data;
  },
  listCandidates: async (
    batchId: number,
    validationStatus?: QbValidation,
  ): Promise<QbPaginated<QbImportCandidate>> => {
    const r = await api.get(`${BASE}/import-batches/${batchId}/candidates/`, {
      params: clean({ validation_status: validationStatus }),
    });
    return r.data;
  },
  promoteBatch: async (id: number): Promise<QbImportBatch> => {
    const r = await api.post(`${BASE}/import-batches/${id}/promote/`);
    return r.data;
  },
};
