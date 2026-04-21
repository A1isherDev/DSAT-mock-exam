"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAttemptBundle, useSaveAnswer, useSubmitAttempt } from "@/features/assessments/hooks";
import { normalizeApiError } from "@/lib/apiError";
import type { AssessmentChoice, AssessmentQuestion } from "@/features/assessments/types";
import { AnswerInput } from "@/features/assessments/components/QuestionInputs";
import {
  answersMapFromAttempt,
  detectAnswerConflicts,
  fingerprintAnswersFromAttempt,
  type AnswerConflict,
} from "@/features/assessments/attemptSync";
import {
  clearAttemptDraftStorage,
  readAttemptDraftEnvelope,
  writeAttemptDraftEnvelope,
} from "@/features/assessments/attemptDraftStorage";
import { normalizeQuestionList } from "@/features/assessments/builder/normalize";

type SaveState = "idle" | "saving" | "saved" | "error";

function parseChoices(raw: any): AssessmentChoice[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const id = String((x as any).id || "").trim();
      const text = String((x as any).text || "");
      if (!id) return null;
      return { id, text };
    })
    .filter(Boolean) as AssessmentChoice[];
}

async function backoffDelayMs(attempt: number) {
  const base = 600;
  const cap = 10_000;
  const ms = Math.min(cap, base * 2 ** attempt);
  await new Promise((r) => setTimeout(r, ms));
}

function syncFingerprintFromAttempt(attempt: any | null | undefined) {
  return fingerprintAnswersFromAttempt(attempt);
}

export default function StudentAttemptRunnerContainer({ attemptId }: { attemptId: number }) {
  const { data, isLoading, error, refetch } = useAttemptBundle(attemptId);
  const save = useSaveAnswer();
  const submit = useSubmitAttempt();

  const attempt = data?.attempt as any;
  const set = data?.set as any;
  const questions = (Array.isArray(data?.questions) ? (data!.questions as AssessmentQuestion[]) : []) as any[];

  const ordered = useMemo(() => normalizeQuestionList(questions as AssessmentQuestion[]), [questions]);

  const initialByQuestionId = useMemo(() => answersMapFromAttempt(attempt), [attempt]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const current = ordered[currentIdx] as any | undefined;
  const currentQuestionId = Number(current?.id || 0);

  const [draftById, setDraftById] = useState<Record<number, any>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [conflicts, setConflicts] = useState<AnswerConflict[]>([]);

  const draftRef = useRef(draftById);
  draftRef.current = draftById;

  const prevServerFpRef = useRef<string | null>(null);
  const lastSavedFpRef = useRef<string | null>(null);

  // Hydrate drafts from local envelope once per attempt
  useEffect(() => {
    const env = readAttemptDraftEnvelope(attemptId);
    if (env?.drafts && Object.keys(env.drafts).length) {
      setDraftById(env.drafts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  // Merge server answers as base (does not wipe newer local keys)
  useEffect(() => {
    setDraftById((prev) => ({ ...initialByQuestionId, ...prev }));
  }, [initialByQuestionId]);

  // Persist draft envelope (v2)
  useEffect(() => {
    writeAttemptDraftEnvelope(attemptId, {
      v: 2,
      drafts: draftById,
      savedFingerprint: lastSavedFpRef.current,
    });
  }, [attemptId, draftById]);

  const debouncedTimer = useRef<any>(null);
  const lastEnqueued = useRef<{ qid: number; value: any } | null>(null);
  const offlineQueue = useRef<Record<number, any>>({});

  const syncFpFromAttempt = useCallback((nextAttempt: any) => {
    const fp = syncFingerprintFromAttempt(nextAttempt);
    prevServerFpRef.current = fp;
    lastSavedFpRef.current = fp;
  }, []);

  // Remote version / fingerprint drift → conflict detection (source of truth: server answers map)
  useEffect(() => {
    if (!attempt) return;
    const fp = syncFingerprintFromAttempt(attempt);
    if (prevServerFpRef.current === null) {
      prevServerFpRef.current = fp;
      lastSavedFpRef.current = fp;
      return;
    }
    if (fp === prevServerFpRef.current) return;
    prevServerFpRef.current = fp;

    const serverMap = answersMapFromAttempt(attempt);
    const nextConflicts = detectAnswerConflicts(draftRef.current, serverMap);
    if (nextConflicts.length) {
      setConflicts(nextConflicts);
      setSaveState("error");
      setSaveMsg("Sync conflict: newer answers exist on the server for one or more questions.");
    } else {
      setConflicts([]);
      syncFpFromAttempt(attempt);
    }
  }, [attempt, syncFpFromAttempt]);

  useEffect(() => {
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  const resolveConflictUseServer = (qid: number) => {
    const row = conflicts.find((c) => c.questionId === qid);
    if (!row || !attempt) return;
    const nextDraft = { ...draftRef.current, [qid]: row.remote };
    setDraftById(nextDraft);
    draftRef.current = nextDraft;
    const serverMap = answersMapFromAttempt(attempt);
    const still = detectAnswerConflicts(nextDraft, serverMap);
    setConflicts(still);
    if (!still.length) syncFpFromAttempt(attempt);
    setSaveMsg(still.length ? "Applied server copy for this question." : "All conflicts resolved.");
  };

  const resolveConflictUseLocal = async (qid: number) => {
    const row = conflicts.find((c) => c.questionId === qid);
    if (!row) return;
    try {
      setSaveState("saving");
      setSaveMsg("Pushing your answer…");
      const res = await save.mutateAsync({ attempt_id: attemptId, question_id: qid, answer: row.local });
      const nextDraft = { ...draftRef.current, [qid]: row.local };
      draftRef.current = nextDraft;
      setDraftById(nextDraft);
      const serverMap = answersMapFromAttempt(res);
      const still = detectAnswerConflicts(nextDraft, serverMap);
      setConflicts(still);
      syncFpFromAttempt(res);
      setSaveState("saved");
      setSaveMsg(still.length ? "Saved; verify remaining conflicts." : "Saved your version.");
    } catch (e) {
      setSaveState("error");
      setSaveMsg(normalizeApiError(e).message);
    }
  };

  const resolveAllUseServer = () => {
    if (!attempt) return;
    const serverMap = answersMapFromAttempt(attempt);
    setDraftById((prev) => ({ ...prev, ...serverMap }));
    syncFpFromAttempt(attempt);
    setConflicts([]);
    setSaveMsg("All local edits for conflicting questions were replaced with server data.");
  };

  const discardLocalDraft = async () => {
    clearAttemptDraftStorage(attemptId);
    setDraftById({ ...initialByQuestionId });
    if (attempt) syncFpFromAttempt(attempt);
    setConflicts([]);
    setSaveMsg("Local draft cleared. Reloaded from server.");
    await refetch();
  };

  const enqueueSave = (qid: number, value: any) => {
    if (conflicts.length) {
      setSaveState("error");
      setSaveMsg("Resolve sync conflicts before autosave continues.");
      return;
    }
    if (!online) {
      offlineQueue.current[qid] = value;
      setSaveState("error");
      setSaveMsg("Offline — will sync when back online.");
      return;
    }
    lastEnqueued.current = { qid, value };
    setSaveState("saving");
    setSaveMsg("Saving…");
    if (debouncedTimer.current) clearTimeout(debouncedTimer.current);
    debouncedTimer.current = setTimeout(() => {
      void flushSave();
    }, 650);
  };

  const flushSave = async () => {
    if (conflicts.length) {
      setSaveState("error");
      setSaveMsg("Resolve sync conflicts before saving.");
      return;
    }
    // If we came back online, flush queued latest answers first.
    if (online) {
      const queuedIds = Object.keys(offlineQueue.current)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n));
      if (queuedIds.length) {
        setSaveState("saving");
        setSaveMsg("Syncing…");
        for (const qid of queuedIds) {
          const v = offlineQueue.current[qid];
          // eslint-disable-next-line no-await-in-loop
          const ok = await (async () => {
            for (let attemptNo = 0; attemptNo < 4; attemptNo++) {
              try {
                const res = await save.mutateAsync({ attempt_id: attemptId, question_id: qid, answer: v });
                syncFpFromAttempt(res);
                setConflicts([]);
                return true;
              } catch (e) {
                const ax = normalizeApiError(e);
                const retryable = ax.status === 0 || ax.status === 429 || ax.status === 503;
                if (!retryable || attemptNo === 3) return false;
                // eslint-disable-next-line no-await-in-loop
                await backoffDelayMs(attemptNo);
              }
            }
            return false;
          })();
          if (ok) {
            delete offlineQueue.current[qid];
          } else {
            setSaveState("error");
            setSaveMsg("Sync failed. Retry.");
            return;
          }
        }
        setSaveState("saved");
        setSaveMsg("Synced");
      }
    }

    const x = lastEnqueued.current;
    if (!x) return;
    lastEnqueued.current = null;

    for (let attemptNo = 0; attemptNo < 4; attemptNo++) {
      try {
        const res = await save.mutateAsync({ attempt_id: attemptId, question_id: x.qid, answer: x.value });
        syncFpFromAttempt(res);
        setConflicts([]);
        setSaveState("saved");
        setSaveMsg("Saved");
        return;
      } catch (e) {
        const ax = normalizeApiError(e);
        const retryable = ax.status === 0 || ax.status === 429 || ax.status === 503;
        if (!retryable || attemptNo === 3) {
          setSaveState("error");
          setSaveMsg(ax.message);
          return;
        }
        // eslint-disable-next-line no-await-in-loop
        await backoffDelayMs(attemptNo);
      }
    }
  };

  const answerValue = currentQuestionId ? draftById[currentQuestionId] : null;

  const progressLabel = `${Math.min(ordered.length, currentIdx + 1)} / ${ordered.length}`;
  const answeredCount = useMemo(() => {
    const ids = ordered.map((q) => Number((q as any).id)).filter((n) => Number.isFinite(n) && n > 0);
    let c = 0;
    for (const id of ids) {
      const v = draftById[id];
      if (v != null && String(v).trim() !== "") c++;
    }
    return c;
  }, [draftById, ordered]);

  const submitNow = async () => {
    setSubmitErr(null);
    if (conflicts.length) {
      setSubmitErr("Resolve sync conflicts before submitting.");
      return null;
    }
    try {
      await flushSave();
      const res = await submit.mutateAsync({ attempt_id: attemptId });
      clearAttemptDraftStorage(attemptId);
      return res;
    } catch (e) {
      setSubmitErr(normalizeApiError(e).message);
      return null;
    }
  };

  if (isLoading) {
    return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">Loading…</div>;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-extrabold text-foreground">Failed to load attempt</p>
        <p className="mt-1 text-sm text-muted-foreground">{String((error as any)?.message || error)}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!current) {
    return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">No questions.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-ds-gold">Assessment</p>
            <p className="mt-1 text-xl font-extrabold tracking-tight text-foreground">{set?.title || "Assessment"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {set?.subject || "—"} · {set?.category || "—"} · {progressLabel} · answered {answeredCount}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="text-xs font-bold uppercase tracking-wider text-label-foreground">Save</p>
            <p className={`text-sm font-semibold ${saveState === "error" ? "text-red-500" : "text-muted-foreground"}`}>
              {saveMsg || "—"}
            </p>
            <p className="text-xs text-muted-foreground">{online ? "Online" : "Offline"}</p>
          </div>
        </div>

        {conflicts.length ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-extrabold text-foreground">Answer sync conflict</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The server has different saved answers than your browser draft (another session, tab, or device may have
              saved). Choose how to proceed per question, or accept all server answers.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => resolveAllUseServer()}
                className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-extrabold hover:bg-surface-2"
              >
                Use server for all
              </button>
              <button
                type="button"
                onClick={() => void discardLocalDraft()}
                className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-extrabold hover:bg-surface-2"
              >
                Clear local cache &amp; refetch
              </button>
            </div>
            <ul className="mt-3 grid gap-2">
              {conflicts.map((c) => (
                <li key={c.questionId} className="rounded-xl border border-border bg-card p-3 text-sm">
                  <p className="font-extrabold text-foreground">Question #{c.questionId}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => resolveConflictUseServer(c.questionId)}
                      className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs font-extrabold hover:bg-card"
                    >
                      Use server
                    </button>
                    <button
                      type="button"
                      onClick={() => void resolveConflictUseLocal(c.questionId)}
                      disabled={save.isPending}
                      className="rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-extrabold hover:bg-primary/15 disabled:opacity-50"
                    >
                      Keep mine &amp; save
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-label-foreground">Question {currentIdx + 1}</p>
          <p className="mt-2 text-base font-extrabold text-foreground">{String(current.prompt || "").trim() || "—"}</p>
          <div className="mt-4">
            <AnswerInput
              type={current.question_type}
              choices={parseChoices(current.choices)}
              value={answerValue}
              onChange={(next) => {
                setDraftById((prev) => ({ ...prev, [currentQuestionId]: next }));
                enqueueSave(currentQuestionId, next);
              }}
            />
          </div>
        </div>

        {submitErr ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4">
            <p className="text-sm font-extrabold text-foreground">Submit failed</p>
            <p className="mt-1 text-sm text-muted-foreground">{submitErr}</p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2 disabled:opacity-50"
          >
            Prev
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void flushSave()}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2"
            >
              Save now
            </button>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2"
            >
              Reload from server
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await submitNow();
                if (res) {
                  window.dispatchEvent(new CustomEvent("assessment:submitted", { detail: { attemptId } }));
                }
              }}
              disabled={submit.isPending || Boolean(conflicts.length)}
              className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-extrabold hover:bg-primary/15 disabled:opacity-50"
            >
              {submit.isPending ? "Submitting…" : "Submit"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => Math.min(ordered.length - 1, i + 1))}
            disabled={currentIdx >= ordered.length - 1}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
