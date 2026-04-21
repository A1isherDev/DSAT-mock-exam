"use client";

import { useParams, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { useMyAssessmentResult } from "@/features/assessments/hooks";

export default function AssessmentResultPage() {
  const router = useRouter();
  const { assignmentId } = useParams();
  const aid = Number(assignmentId);
  const { data, isLoading, error, refetch } = useMyAssessmentResult(aid);
  const attempt = (data as any)?.attempt || null;
  const result = (data as any)?.result || null;

  return (
    <AuthGuard>
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-ds-gold">Result</p>
        <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">Homework #{aid}</p>

        {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : null}
        {error ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4">
            <p className="text-sm font-extrabold text-foreground">Failed to load</p>
            <p className="mt-1 text-sm text-muted-foreground">{String((error as any)?.message || error)}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!isLoading && !error ? (
          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-extrabold text-foreground">Attempt</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {attempt ? `#${attempt.id} · status ${attempt.status}` : "No attempt yet."}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-extrabold text-foreground">Score</p>
              {result ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.score_points} / {result.max_points} · {result.correct_count} correct · {result.percent}% · time{" "}
                  {attempt?.total_time_seconds ?? 0}s
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Not graded yet{attempt?.grading_status ? ` (grading: ${attempt.grading_status})` : ""}.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push(`/assessments/${aid}`)}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2"
              >
                Back
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </AuthGuard>
  );
}

