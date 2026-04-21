"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { normalizeApiError } from "@/lib/apiError";
import { useMyAssessmentResult, useStartAttempt } from "@/features/assessments/hooks";

export default function AssessmentStartPage() {
  const router = useRouter();
  const { assignmentId } = useParams();
  const aid = Number(assignmentId);

  const start = useStartAttempt();
  const { data, isLoading, error, refetch } = useMyAssessmentResult(aid);
  const attempt = (data as any)?.attempt || null;
  const result = (data as any)?.result || null;

  const [err, setErr] = useState<string | null>(null);

  const canResume = attempt && attempt.status === "in_progress";
  const canViewResult = result != null || (attempt && attempt.status !== "in_progress");

  const begin = async () => {
    setErr(null);
    try {
      const att = await start.mutateAsync({ assignment_id: aid });
      router.push(`/assessments/attempt/${att.id}`);
    } catch (e) {
      setErr(normalizeApiError(e).message);
    }
  };

  return (
    <AuthGuard>
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-ds-gold">Assessment</p>
        <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">Homework #{aid}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Start or resume your attempt. Backend will enforce membership and locks.
        </p>

        {err ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4">
            <p className="text-sm font-extrabold text-foreground">Error</p>
            <p className="mt-1 text-sm text-muted-foreground">{err}</p>
          </div>
        ) : null}

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

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void begin()}
            disabled={!Number.isFinite(aid) || aid <= 0 || start.isPending}
            className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-extrabold hover:bg-primary/15 disabled:opacity-50"
          >
            {start.isPending ? "Starting…" : canResume ? "Resume" : "Start"}
          </button>

          {canViewResult ? (
            <button
              type="button"
              onClick={() => router.push(`/assessments/result/${aid}`)}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2"
            >
              View result
            </button>
          ) : null}
        </div>
      </div>
    </AuthGuard>
  );
}

