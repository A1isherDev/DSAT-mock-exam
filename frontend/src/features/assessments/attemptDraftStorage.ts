const LS_PREFIX = "assessment_attempt_draft_v2:";

export type AttemptDraftEnvelope = {
  v: 2;
  drafts: Record<number, unknown>;
  /** Last known server answer fingerprint we aligned with (optional UX hint). */
  savedFingerprint: string | null;
};

export function attemptDraftLsKey(attemptId: number) {
  return `${LS_PREFIX}${attemptId}`;
}

/** Legacy v1 key (plain JSON object of drafts). */
export function attemptDraftLegacyLsKey(attemptId: number) {
  return `assessment_attempt_draft_v1:${attemptId}`;
}

export function readAttemptDraftEnvelope(attemptId: number): AttemptDraftEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(attemptDraftLsKey(attemptId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Number(parsed.v) === 2) {
        const drafts = typeof (parsed as any).drafts === "object" && (parsed as any).drafts ? (parsed as any).drafts : {};
        const normDrafts: Record<number, unknown> = {};
        for (const [k, v] of Object.entries(drafts)) {
          const qid = Number(k);
          if (Number.isFinite(qid)) normDrafts[qid] = v;
        }
        return {
          v: 2,
          drafts: normDrafts,
          savedFingerprint: typeof (parsed as any).savedFingerprint === "string" ? (parsed as any).savedFingerprint : null,
        };
      }
    }
    const legacy = localStorage.getItem(attemptDraftLegacyLsKey(attemptId));
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed && typeof parsed === "object") {
        const normDrafts: Record<number, unknown> = {};
        for (const [k, v] of Object.entries(parsed)) {
          const qid = Number(k);
          if (Number.isFinite(qid)) normDrafts[qid] = v;
        }
        return { v: 2, drafts: normDrafts, savedFingerprint: null };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function writeAttemptDraftEnvelope(attemptId: number, env: AttemptDraftEnvelope) {
  try {
    localStorage.setItem(attemptDraftLsKey(attemptId), JSON.stringify(env));
  } catch {
    // ignore
  }
}

export function clearAttemptDraftStorage(attemptId: number) {
  try {
    localStorage.removeItem(attemptDraftLsKey(attemptId));
    localStorage.removeItem(attemptDraftLegacyLsKey(attemptId));
  } catch {
    // ignore
  }
}
