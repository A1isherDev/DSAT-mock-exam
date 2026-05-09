"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import AuthGuard from "@/components/AuthGuard";
import { normalizeApiError } from "@/lib/apiError";
import { useMyAssessmentResult, useStartAttempt } from "@/features/assessments/hooks";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileQuestion,
  Loader2,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

// The backend now returns a `meta` block alongside attempt/result.
// Typed locally here; matches _build_hw_meta() in assessments/views.py.
type HwMeta = {
  assignment_title: string | null;
  set_title: string | null;
  set_category: string | null;
  due_at: string | null;
  question_count: number;
  classroom_name: string | null;
};

type MyResultData = {
  attempt: { id: number; status: string; grading_status?: string | null } | null;
  result: { score_points: string; max_points: string; percent: string; correct_count: number; total_questions: number } | null;
  meta?: HwMeta;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDueDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isDueSoon(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const due = new Date(iso).getTime();
  const now = Date.now();
  return due > now && due - now < 24 * 60 * 60 * 1000; // < 24h
}

function isPastDue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentStartPage() {
  const router = useRouter();
  const { assignmentId } = useParams();
  const aid = Number(assignmentId);

  const start = useStartAttempt();
  const { data, isLoading, error, refetch } = useMyAssessmentResult(aid);

  // Cast to richer type (backend now includes `meta`)
  const richData = data as MyResultData | undefined;
  const attempt = richData?.attempt ?? null;
  const result = richData?.result ?? null;
  const meta = richData?.meta ?? null;

  const [startErr, setStartErr] = useState<string | null>(null);

  const canResume = attempt?.status === "in_progress";
  const isGraded = attempt?.status === "graded";
  const isSubmitted = attempt?.status === "submitted";
  const hasResult = result != null;
  const canViewResult = hasResult || isGraded || isSubmitted;

  const dueDateStr = formatDueDate(meta?.due_at);
  const overdue = isPastDue(meta?.due_at);
  const dueSoon = isDueSoon(meta?.due_at);

  const begin = async () => {
    setStartErr(null);
    try {
      const att = await start.mutateAsync({ assignment_id: aid });
      router.push(`/assessments/attempt/${att.id}`);
    } catch (e) {
      setStartErr(normalizeApiError(e).message);
    }
  };

  // ── Resolved title: prefer the real assignment title, fall back gracefully ──
  const displayTitle =
    meta?.assignment_title?.trim() ||
    meta?.set_title?.trim() ||
    "Assessment";

  return (
    <AuthGuard>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="rounded-2xl border border-border bg-card p-10 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {/* ── Load error ──────────────────────────────────────────────────── */}
        {error && !isLoading && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm font-bold text-red-800">Could not load assignment</p>
            <p className="text-sm text-red-700 mt-1">
              {String((error as { message?: string })?.message || "Unknown error")}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* ── Main card ───────────────────────────────────────────────────── */}
        {!isLoading && !error && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            {/* Header */}
            <div className="border-b border-border px-6 py-5">
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">
                Assessment
              </p>
              <h1 className="text-xl font-extrabold text-foreground tracking-tight leading-snug">
                {displayTitle}
              </h1>
              {meta?.set_title && meta.set_title !== meta.assignment_title && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {meta.set_title}
                </p>
              )}
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-0 sm:grid-cols-3 divide-x divide-y divide-border border-b border-border">
              {meta?.set_category && (
                <div className="px-5 py-3 flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Category
                    </p>
                    <p className="text-sm font-semibold text-foreground">{meta.set_category}</p>
                  </div>
                </div>
              )}
              {meta?.question_count != null && (
                <div className="px-5 py-3 flex items-center gap-2">
                  <FileQuestion className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Questions
                    </p>
                    <p className="text-sm font-semibold text-foreground">{meta.question_count}</p>
                  </div>
                </div>
              )}
              {dueDateStr && (
                <div className="px-5 py-3 flex items-center gap-2">
                  <Clock
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      overdue
                        ? "text-red-500"
                        : dueSoon
                        ? "text-amber-500"
                        : "text-muted-foreground",
                    )}
                  />
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Due
                    </p>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        overdue
                          ? "text-red-600"
                          : dueSoon
                          ? "text-amber-600"
                          : "text-foreground",
                      )}
                    >
                      {dueDateStr}
                      {overdue && " · Overdue"}
                      {!overdue && dueSoon && " · Due soon"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Status / result summary */}
            <div className="px-6 py-5 space-y-4">
              {/* Already has a result */}
              {hasResult && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-900">Completed</p>
                    <p className="text-sm text-emerald-800">
                      {result.correct_count} / {result.total_questions} correct
                      {" · "}
                      {Number(result.percent).toFixed(0)}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/assessments/result/${aid}`)}
                    className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline whitespace-nowrap"
                  >
                    See results <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* In progress */}
              {canResume && !hasResult && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-sm font-bold text-amber-900">In progress</p>
                  <p className="text-sm text-amber-800">
                    You have an unfinished attempt. Resume to continue where you left off.
                  </p>
                </div>
              )}

              {/* Submitted, waiting for grading */}
              {isSubmitted && !hasResult && (
                <div className="rounded-xl bg-surface-2 border border-border px-4 py-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <p className="text-sm font-semibold text-foreground">
                    Submitted — grading in progress…
                  </p>
                </div>
              )}

              {/* Start error */}
              {startErr && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {startErr}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                {!isGraded && !isSubmitted && (
                  <button
                    type="button"
                    onClick={() => void begin()}
                    disabled={!Number.isFinite(aid) || aid <= 0 || start.isPending}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {start.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting…
                      </>
                    ) : canResume ? (
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Resume
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Start assessment
                      </>
                    )}
                  </button>
                )}

                {canViewResult && (
                  <button
                    type="button"
                    onClick={() => router.push(`/assessments/result/${aid}`)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-extrabold text-foreground hover:bg-surface-2 transition-colors"
                  >
                    View results
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
