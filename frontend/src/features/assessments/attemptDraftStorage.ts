const LS_PREFIX = "assessment_attempt_draft_v2:";

export type AttemptDraftEnvelope = {
  v: 2;
  drafts: Record<number, unknown>;
  /** Last known server answer fingerprint we aligned with (optional UX hint). */
  savedFingerprint: string | null;
  /**
   * Question IDs whose draft answers have NOT yet been confirmed saved to
   * the server. Persisted across page refreshes so that if iOS Safari kills
   * the tab while offline, the runner re-queues them on next load.
   */
  pendingQids?: number[];
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
        const rawPending = (parsed as any).pendingQids;
        const pendingQids: number[] = Array.isArray(rawPending)
          ? rawPending.map(Number).filter(Number.isFinite)
          : [];
        return {
          v: 2,
          drafts: normDrafts,
          savedFingerprint: typeof (parsed as any).savedFingerprint === "string" ? (parsed as any).savedFingerprint : null,
          pendingQids,
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
  const key = attemptDraftLsKey(attemptId);
  const payload = JSON.stringify(env);
  try {
    localStorage.setItem(key, payload);
  } catch (e) {
    // QuotaExceededError (Safari private browsing, full storage) — attempt
    // recovery by evicting stale drafts for OTHER attempts, then retry once.
    if (e instanceof DOMException) {
      try {
        const staleKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LS_PREFIX) && k !== key) staleKeys.push(k);
        }
        staleKeys.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
        localStorage.setItem(key, payload);
      } catch {
        // Still failing (e.g. Safari ITP). Silently degrade — answers remain
        // in memory and will still be saved to the server when online.
      }
    }
  }
}

/**
 * Validate that a persisted draft envelope is structurally sound.
 * Returns null if the data looks corrupt (e.g. partial writes).
 */
export function validateAttemptDraftEnvelope(raw: AttemptDraftEnvelope): AttemptDraftEnvelope | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.v !== 2) return null;
  if (typeof raw.drafts !== "object" || raw.drafts === null) return null;
  // Guard against corrupt pendingQids
  const pendingQids = Array.isArray(raw.pendingQids)
    ? raw.pendingQids.filter((x): x is number => typeof x === "number" && Number.isFinite(x))
    : [];
  return { ...raw, pendingQids };
}

export function clearAttemptDraftStorage(attemptId: number) {
  try {
    localStorage.removeItem(attemptDraftLsKey(attemptId));
    localStorage.removeItem(attemptDraftLegacyLsKey(attemptId));
  } catch {
    // ignore
  }
}

// ─── sessionStorage draft mirror ─────────────────────────────────────────────
// A per-tab, in-session copy of the draft map. Survives page refreshes within
// the same tab. Serves as a fallback when localStorage is unavailable (Safari
// private browsing, quota exceeded + eviction failed, restricted contexts).
// Unlike the primary localStorage draft, this is NOT persisted across tabs or
// across iOS app kills — it is purely a same-tab reload safety net.

const SS_DRAFT_PREFIX = "assessment_draft_session_v1:";

export function writeDraftMirror(attemptId: number, drafts: Record<number, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${SS_DRAFT_PREFIX}${attemptId}`, JSON.stringify(drafts));
  } catch { /* non-fatal — sessionStorage may also be restricted */ }
}

export function readDraftMirror(attemptId: number): Record<number, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${SS_DRAFT_PREFIX}${attemptId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<number, unknown> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const qid = Number(k);
      if (Number.isFinite(qid)) out[qid] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export function clearDraftMirror(attemptId: number): void {
  try {
    sessionStorage.removeItem(`${SS_DRAFT_PREFIX}${attemptId}`);
  } catch { /* non-fatal */ }
}

// ─── Submit receipts ──────────────────────────────────────────────────────────
// A lightweight localStorage record that confirms a submit landed.
// Used to show a submission timestamp on the complete/already-submitted screens
// and to give students certainty across page reloads.

const RECEIPT_PREFIX = "attempt_receipt_v1:";

export type SubmitReceipt = {
  ts: number;           // Unix ms — when the submit API responded with 2xx
  attemptId: number;
  assignmentId: number | null;
};

export function writeSubmitReceipt(attemptId: number, assignmentId: number | null, serverTs?: number | null) {
  try {
    // Prefer server-issued timestamp (authoritative); fall back to client clock.
    const ts = serverTs != null && Number.isFinite(serverTs) ? serverTs : Date.now();
    localStorage.setItem(
      `${RECEIPT_PREFIX}${attemptId}`,
      JSON.stringify({ ts, attemptId, assignmentId } satisfies SubmitReceipt),
    );
  } catch { /* non-fatal */ }
}

export function readSubmitReceipt(attemptId: number): SubmitReceipt | null {
  try {
    const raw = localStorage.getItem(`${RECEIPT_PREFIX}${attemptId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SubmitReceipt>;
    if (typeof parsed?.ts === "number" && typeof parsed?.attemptId === "number") {
      return { ts: parsed.ts, attemptId: parsed.attemptId, assignmentId: parsed.assignmentId ?? null };
    }
    return null;
  } catch {
    return null;
  }
}

/** Format a receipt timestamp as a short human-readable string. */
export function formatReceiptTime(ts: number): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
