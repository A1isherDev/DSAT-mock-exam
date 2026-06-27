"use client";

/**
 * Presentational screens + indicators for the assessment runner.
 *
 * These are pure, stateless components extracted from StudentAttemptRunnerContainer
 * to keep the container focused on state orchestration. They receive everything
 * via props and own no attempt logic.
 */

import { CheckCircle2, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AnswerConflict } from "@/features/assessments/attemptSync";
import { formatReceiptTime, readSubmitReceipt } from "@/features/assessments/attemptDraftStorage";

export type SaveState = "idle" | "saving" | "saved" | "offline" | "error";

/** Format elapsed seconds as h:mm:ss (or m:ss under an hour). */
export function fmtElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Save indicator ───────────────────────────────────────────────────────────
// Shows ambient save state without alarming the student.
// "saving" → subtle pulsing dot only (invisible unless you look)
// "saved"  → green dot + "Saved" label for 2s (reassuring, then vanishes)
// error/offline → handled by dedicated banners, not here

export function SaveDot({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span className="inline-flex items-center gap-1" aria-live="polite" aria-atomic>
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full transition-all duration-500",
          state === "saving" && "bg-muted-foreground/40 animate-pulse",
          state === "saved" && "bg-emerald-500",
          (state === "offline" || state === "error") && "bg-amber-500",
        )}
        aria-hidden
      />
      {state === "saved" && (
        <span className="text-[10px] font-semibold text-emerald-600 leading-none">
          Saved
        </span>
      )}
      {state === "saving" && (
        <span className="text-[10px] font-medium text-muted-foreground/60 leading-none">
          Saving…
        </span>
      )}
    </span>
  );
}

// ─── Question map ─────────────────────────────────────────────────────────────

export function QuestionMap({
  total,
  currentIdx,
  answeredIds,
  questionIds,
  onJump,
}: {
  total: number;
  currentIdx: number;
  answeredIds: Set<number>;
  questionIds: number[];
  onJump: (idx: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" role="navigation" aria-label="Question navigation">
      {Array.from({ length: total }).map((_, i) => {
        const qid = questionIds[i];
        const isAnswered = qid != null && answeredIds.has(qid);
        const isCurrent = i === currentIdx;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onJump(i)}
            aria-label={`Question ${i + 1}${isAnswered ? " (answered)" : ""}${isCurrent ? " (current)" : ""}`}
            className={cn(
              // h-9 w-9 = 36px — closer to 44px minimum; gap-2 adds effective touch margin
              "h-9 w-9 rounded-lg text-xs font-bold transition-all",
              isCurrent
                ? "bg-primary text-primary-foreground shadow-sm scale-110"
                : isAnswered
                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                : "bg-surface-2 text-muted-foreground hover:bg-border",
            )}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

// ─── Conflict dialog ──────────────────────────────────────────────────────────

export function ConflictDialog({
  conflicts,
  onKeepMine,
  onUseOther,
  onKeepAllMine,
  saving,
}: {
  conflicts: AnswerConflict[];
  onKeepMine: (qid: number) => Promise<void>;
  onUseOther: (qid: number) => void;
  onKeepAllMine: () => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
      <div>
        <p className="text-sm font-bold text-amber-900">
          We found answers from another session
        </p>
        <p className="text-sm text-amber-800 mt-1">
          Another device or browser tab saved different answers for{" "}
          {conflicts.length === 1 ? "1 question" : `${conflicts.length} questions`}.
          Choose which version to keep for each.
        </p>
      </div>

      <div className="space-y-2">
        {conflicts.map((c) => (
          <div
            key={c.questionId}
            className="rounded-xl border border-amber-200 bg-white p-3 flex flex-wrap items-center gap-3"
          >
            <span className="text-sm font-bold text-amber-900 shrink-0">
              Question {c.questionId}
            </span>
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => void onKeepMine(c.questionId)}
                disabled={saving}
                className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/15 disabled:opacity-50"
              >
                Keep mine
              </button>
              <button
                type="button"
                onClick={() => onUseOther(c.questionId)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-surface-2"
              >
                Use other
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onKeepAllMine}
        className="text-xs font-bold text-amber-800 hover:underline"
      >
        Keep all my answers for every question →
      </button>
    </div>
  );
}

// ─── Submit confirm screen ────────────────────────────────────────────────────

export function SubmitConfirmScreen({
  title,
  answeredCount,
  totalCount,
  onConfirm,
  onBack,
}: {
  title: string;
  answeredCount: number;
  totalCount: number;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const unanswered = totalCount - answeredCount;
  return (
    <div className="mx-auto w-full max-w-lg space-y-5">
      <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <div className="rounded-full bg-primary/10 p-4 w-16 h-16 mx-auto flex items-center justify-center">
          <Send className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-foreground">Ready to submit?</h2>
          <p className="text-sm text-muted-foreground mt-1">{title}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-surface-2 px-4 py-3">
            <p className="text-2xl font-extrabold text-emerald-700 tabular-nums">
              {answeredCount}
            </p>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              Answered
            </p>
          </div>
          <div className="rounded-xl bg-surface-2 px-4 py-3">
            <p
              className={cn(
                "text-2xl font-extrabold tabular-nums",
                unanswered > 0 ? "text-amber-600" : "text-foreground",
              )}
            >
              {unanswered}
            </p>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              Unanswered
            </p>
          </div>
        </div>

        {unanswered > 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
            You have {unanswered} unanswered question
            {unanswered !== 1 ? "s" : ""}. You can go back and answer them, or
            submit now.
          </p>
        )}

        {/* Trust signal — reassure before submitting */}
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          Your answers are saved and will not be lost.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 inline mr-1" />
            Go back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Submit
            <ChevronRight className="h-4 w-4 inline ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Review screen (post-submit time summary) ────────────────────────────────

export function ReviewScreen({
  title,
  assignmentId,
  questionIds,
  questionTimes,
  totalElapsed,
}: {
  title: string;
  assignmentId: number | null;
  questionIds: number[];
  questionTimes: Record<number, number>;
  totalElapsed: number;
}) {
  const totalTracked = Object.values(questionTimes).reduce((a, b) => a + b, 0);
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <div className="rounded-full bg-emerald-100 p-4 w-20 h-20 mx-auto flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">Submitted!</h2>
          <p className="text-muted-foreground mt-1">{title}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-center">
            <p className="text-2xl font-extrabold text-primary tabular-nums">{fmtElapsed(totalElapsed)}</p>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Total time</p>
          </div>
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-center">
            <p className="text-2xl font-extrabold text-foreground tabular-nums">{questionIds.length}</p>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Questions</p>
          </div>
        </div>
      </div>

      {/* Per-question time breakdown */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wide">
          Time per question
        </h3>
        <div className="space-y-1.5">
          {questionIds.map((qid, i) => {
            const sec = questionTimes[qid] || 0;
            const pct = totalTracked > 0 ? Math.round((sec / totalTracked) * 100) : 0;
            return (
              <div key={qid} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                <span className="text-xs font-bold text-muted-foreground w-6 text-right shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold text-foreground tabular-nums w-12 text-right shrink-0">
                  {fmtElapsed(sec)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-center gap-3">
        {assignmentId ? (
          <a
            href={`/assessments/result/${assignmentId}`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            View results
            <ChevronRight className="h-4 w-4" />
          </a>
        ) : (
          <a
            href="/classes"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-extrabold text-foreground hover:bg-surface-2 transition-colors"
          >
            Back to classes
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Complete screen ──────────────────────────────────────────────────────────

export function CompleteScreen({
  title,
  assignmentId,
  attemptId,
}: {
  title: string;
  assignmentId: number | null;
  attemptId: number;
}) {
  const receipt = readSubmitReceipt(attemptId);
  const timeLabel = receipt ? formatReceiptTime(receipt.ts) : null;
  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-5">
        <div className="rounded-full bg-emerald-100 p-4 w-20 h-20 mx-auto flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">Submitted</h2>
          <p className="text-muted-foreground mt-1">{title}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {timeLabel
            ? <>Your answers were received at <span className="font-semibold text-foreground">{timeLabel}</span>. Grading is in progress.</>
            : "Your answers have been saved and submitted. Grading is in progress."
          }
        </p>
        {assignmentId ? (
          <a
            href={`/assessments/result/${assignmentId}`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            View results
            <ChevronRight className="h-4 w-4" />
          </a>
        ) : (
          <a
            href="/classes"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-extrabold text-foreground hover:bg-surface-2 transition-colors"
          >
            Back to classes
          </a>
        )}
      </div>
    </div>
  );
}
