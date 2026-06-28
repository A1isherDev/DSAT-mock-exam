"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AuthGuard from "@/components/AuthGuard";
import { useMyAssessmentResult } from "@/features/assessments/hooks";
import { assessmentsStudentApi, type PedagogicalReviewQuestion } from "@/features/assessmentsStudent/api";
import { spawnRipple } from "@/features/classroom/ui/ripple";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardContent, Button, ProgressRing, Switch, EmptyState, Spinner } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────

type HwMeta = {
  assignment_title: string | null;
  set_title: string | null;
  set_category: string | null;
  due_at: string | null;
  question_count: number;
  classroom_name: string | null;
};

type MyResultData = {
  attempt: {
    id: number;
    status: string;
    grading_status?: string | null;
    total_time_seconds?: number | null;
    question_times?: Record<string, number> | null;
    answers?: Array<{ question_id: number; answer: string | null; is_correct: boolean | null; points_awarded?: number | null }>;
  } | null;
  result: { score_points: string; max_points: string; percent: string; correct_count: number; total_questions: number; graded_at?: string | null } | null;
  meta?: HwMeta;
};

type RowStatus = "correct" | "incorrect" | "omitted";
type FilterKey = "all" | "wrong" | "correct";
type PerPage = 10 | 30 | "all";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** s>=60 → "Xm Ys" else "Xs". */
function fmtSec(s: number): string {
  if (!s || s <= 0) return "0s";
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function statusOf(q: PedagogicalReviewQuestion): RowStatus {
  if (q.is_correct === true) return "correct";
  const sa = q.student_answer;
  const empty = sa === null || sa === undefined || (typeof sa === "string" && sa.trim() === "");
  if (empty) return "omitted";
  return "incorrect";
}

function answerToDisplay(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() === "" ? "—" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => answerToDisplay(v)).join(", ");
  return String(value);
}

const STATUS_META: Record<RowStatus, { label: string; tone: string }> = {
  correct: { label: "Correct", tone: "text-emerald-500" },
  incorrect: { label: "Incorrect", tone: "text-rose-500" },
  omitted: { label: "Omitted", tone: "text-slate-400" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentResultPage() {
  const router = useRouter();
  const { assignmentId } = useParams();
  const aid = Number(assignmentId);
  const { data, isLoading, error, refetch } = useMyAssessmentResult(aid);

  const richData = data as MyResultData | undefined;
  const attempt = richData?.attempt ?? null;
  const result = richData?.result ?? null;
  const meta = richData?.meta ?? null;

  const graded = !!result;
  const attemptId = attempt?.id ?? 0;

  // Pedagogical review — the per-question breakdown (with correct answers + student answers).
  const reviewQuery = useQuery({
    queryKey: ["assessmentPedagogicalReview", attemptId],
    queryFn: () => assessmentsStudentApi.pedagogicalReview(attemptId),
    enabled: graded && Number.isFinite(attemptId) && attemptId > 0,
  });
  const review = reviewQuery.data ?? null;

  // ── Derived top-level values ──
  const displayTitle = meta?.set_title?.trim() || meta?.assignment_title?.trim() || "Assessment";
  const percent = result ? Math.round(Number(result.percent)) : 0;
  const totalQuestions = result?.total_questions ?? 0;
  const correctCount = result?.correct_count ?? 0;
  const totalTime = attempt?.total_time_seconds ?? 0;
  const avgPerQuestion = totalQuestions > 0 ? Math.round(totalTime / totalQuestions) : 0;

  const ringColor = percent >= 70 ? "text-emerald-500" : percent >= 40 ? "text-amber-500" : "text-rose-500";
  const band =
    percent >= 70
      ? { label: "On track", cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
      : percent >= 40
      ? { label: "Getting there", cls: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400" }
      : { label: "Keep building", cls: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400" };

  // ── Breakdown state ──
  const [showAnswers, setShowAnswers] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [perPage, setPerPage] = useState<PerPage>(10);
  const [page, setPage] = useState(1);

  const allRows = useMemo(() => {
    const qs = review?.questions ?? [];
    return [...qs]
      .sort((a, b) => a.order - b.order)
      .map((q) => ({ q, status: statusOf(q) }));
  }, [review]);

  const counts = useMemo(() => {
    let correct = 0, wrong = 0;
    for (const r of allRows) {
      if (r.status === "correct") correct += 1;
      else wrong += 1; // incorrect + omitted
    }
    return { all: allRows.length, wrong, correct };
  }, [allRows]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return allRows;
    if (filter === "correct") return allRows.filter((r) => r.status === "correct");
    return allRows.filter((r) => r.status === "incorrect" || r.status === "omitted");
  }, [allRows, filter]);

  const effectivePerPage = perPage === "all" ? Math.max(1, filteredRows.length) : perPage;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / effectivePerPage));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pageRows = filteredRows.slice((safePage - 1) * effectivePerPage, (safePage - 1) * effectivePerPage + effectivePerPage);

  const questionTimes = attempt?.question_times ?? null;
  const timeForQuestion = (qid: number): number => (questionTimes ? Number(questionTimes[String(qid)] || 0) : 0);

  const filterDefs: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "wrong", label: "Incorrect & Omitted", count: counts.wrong },
    { key: "correct", label: "Correct", count: counts.correct },
  ];
  const viewDefs: { key: PerPage; label: string }[] = [
    { key: 10, label: "10" },
    { key: 30, label: "30" },
    { key: "all", label: "All" },
  ];

  const pager = useMemo(() => pageWindow(safePage, pageCount), [safePage, pageCount]);

  return (
    <AuthGuard>
      <div className="cr-section mx-auto flex w-full max-w-4xl flex-col gap-4 pb-12">
        <button
          type="button"
          onClick={() => router.push(`/assessments/${aid}`)}
          className="ds-ring inline-flex w-fit items-center gap-2 rounded-lg text-sm font-bold text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-[17px] w-[17px]" /> Back to assignment
        </button>

        {isLoading ? (
          <Card><CardContent className="flex justify-center py-12"><Spinner className="h-8 w-8 text-primary" /></CardContent></Card>
        ) : null}

        {error && !isLoading ? (
          <EmptyState
            title="Could not load result"
            description={String((error as { message?: string })?.message || "Unknown error")}
            action={<Button variant="secondary" leftIcon={<RefreshCw />} onClick={() => void refetch()}>Retry</Button>}
          />
        ) : null}

        {!isLoading && !error && !result && attempt ? (
          <Card><CardContent className="flex flex-col items-center py-10 text-center">
            <Spinner className="mb-3 h-8 w-8 text-primary" />
            <p className="ds-h4">Grading in progress</p>
            <p className="mt-1 text-sm text-muted-foreground">Results will appear here once grading is complete.</p>
            <Button className="mt-4" variant="secondary" leftIcon={<RefreshCw />} onClick={() => void refetch()}>Check again</Button>
          </CardContent></Card>
        ) : null}

        {!isLoading && !error && !attempt ? (
          <EmptyState
            title="No attempt yet"
            description="You haven't started this assignment yet."
            action={<Button onClick={() => router.push(`/assessments/${aid}`)}>Go to assignment</Button>}
          />
        ) : null}

        {!isLoading && !error && result ? (
          <>
            {/* ── HERO: score ring + stat strip ── */}
            <Card className="cr-cardrise overflow-hidden">
              <div className="flex flex-col items-center gap-5 px-6 py-9 sm:flex-row sm:gap-8 sm:px-10">
                <ProgressRing value={percent} size={150} strokeWidth={11} color={ringColor} showLabel={false} className="shrink-0">
                  <span className={cn("ds-num text-4xl font-extrabold", ringColor)}>{percent}%</span>
                </ProgressRing>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="ds-overline text-primary">Score</p>
                  <h1 className="mt-1 ds-h2 leading-tight text-foreground">{displayTitle}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {correctCount} of {totalQuestions} correct · {fmtSec(totalTime)}
                  </p>
                  <span className={cn("cr-pillin mt-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold", band.cls)}>
                    {band.label}
                  </span>
                </div>
              </div>

              {/* stat strip */}
              <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
                <StatCell label="POINTS" value={result.score_points} />
                <StatCell label="MAX POINTS" value={result.max_points} />
                <StatCell label="TOTAL TIME" value={fmtSec(totalTime)} />
                <StatCell label="AVG PER QUESTION" value={`${avgPerQuestion} sec`} accent />
              </div>
            </Card>

            {/* ── Question breakdown ── */}
            <Card className="cr-cardrise">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-5">
                <p className="ds-h4">Question breakdown</p>
                <div className="flex flex-wrap items-center gap-5">
                  <Switch checked={showAnswers} onCheckedChange={setShowAnswers} label="Show correct answers" />
                  <div className="inline-flex items-center gap-2.5">
                    <span className="text-sm font-bold text-label-foreground">View:</span>
                    {viewDefs.map((v, i) => {
                      const on = perPage === v.key;
                      return (
                        <span key={String(v.key)} className="inline-flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => { setPerPage(v.key); setPage(1); }}
                            className={cn(
                              "ds-ring rounded text-sm font-extrabold transition-colors",
                              on ? "text-foreground" : "text-primary underline decoration-1 underline-offset-[3px] hover:text-primary-hover",
                            )}
                          >
                            {v.label}
                          </button>
                          {i < viewDefs.length - 1 ? <span className="font-semibold text-label-foreground">|</span> : null}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* filter pills */}
              <div className="flex flex-wrap items-center gap-2.5 px-6 pb-2 pt-4">
                {filterDefs.map((f) => {
                  const on = filter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onPointerDown={spawnRipple}
                      onClick={() => { setFilter(f.key); setPage(1); }}
                      className={cn(
                        "cr-pillin cr-press cr-ripple inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-bold transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-surface-2",
                      )}
                    >
                      {f.label}
                      <span
                        className={cn(
                          "ds-num rounded-full px-2 py-0.5 text-[12px] font-extrabold",
                          on ? "bg-white/20 text-primary-foreground" : "bg-surface-2 text-label-foreground",
                        )}
                      >
                        {f.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* table */}
              <div className="px-6 pb-6 pt-3">
                <div className="overflow-hidden rounded-xl border border-border">
                  <div className="grid grid-cols-[64px_1.1fr_1.1fr_92px_84px] bg-surface-3">
                    {["Question", "Correct Answer", "Your Answer", "Time", "Actions"].map((h, i) => (
                      <div
                        key={h}
                        className={cn("px-4 py-3.5 text-[13px] font-extrabold text-foreground", i === 4 && "text-right")}
                      >
                        {h}
                      </div>
                    ))}
                  </div>

                  {pageRows.length === 0 ? (
                    <div className="border-t border-border px-4 py-10 text-center text-sm text-muted-foreground">
                      No questions match this filter.
                    </div>
                  ) : (
                    pageRows.map(({ q, status }, i) => {
                      const sm = STATUS_META[status];
                      const sec = timeForQuestion(q.id);
                      const slow = sec > 15;
                      return (
                        <div
                          key={q.id}
                          className="cr-rowin2 grid grid-cols-[64px_1.1fr_1.1fr_92px_84px] items-center border-t border-border transition-colors hover:bg-surface-2"
                          style={{ animationDelay: `${i * 45}ms` }}
                        >
                          <div className="px-4 py-4 text-sm font-bold text-foreground">Q{q.order + 1}</div>
                          <div className="bg-surface-2/60 px-4 py-4 text-sm font-bold text-foreground">
                            {showAnswers ? answerToDisplay(q.correct_answer) : "—"}
                          </div>
                          <div className={cn("px-4 py-4 text-sm font-extrabold", sm.tone)}>{sm.label}</div>
                          <div className={cn("ds-num px-4 py-4 text-sm font-semibold", slow ? "text-rose-500" : "text-foreground")}>
                            {sec > 0 ? fmtSec(sec) : "—"}
                          </div>
                          <div className="px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => router.push(`/assessments/review/${attemptId}`)}
                              className="ds-ring rounded text-sm font-extrabold text-primary transition-colors hover:text-primary-hover hover:underline underline-offset-[3px]"
                            >
                              Review
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* pagination */}
                {pageCount > 1 ? (
                  <div className="mt-6 flex items-center justify-center gap-1.5">
                    <PagerButton
                      ariaLabel="Previous page"
                      disabled={safePage <= 1}
                      onClick={() => setPage(Math.max(1, safePage - 1))}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </PagerButton>
                    {pager.map((p, i) =>
                      p === "…" ? (
                        <span key={`gap-${i}`} className="inline-flex h-10 min-w-10 items-center justify-center text-sm font-extrabold text-label-foreground">
                          …
                        </span>
                      ) : (
                        <PagerButton key={p} active={p === safePage} onClick={() => setPage(p)}>
                          {p}
                        </PagerButton>
                      ),
                    )}
                    <PagerButton
                      ariaLabel="Next page"
                      disabled={safePage >= pageCount}
                      onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                    >
                      <ArrowLeft className="h-4 w-4 rotate-180" />
                    </PagerButton>
                  </div>
                ) : null}
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </AuthGuard>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-border px-5 py-5 text-center [&:not(:last-child)]:border-r">
      <p className={cn("ds-num text-[22px] font-extrabold leading-tight", accent ? "text-primary" : "text-foreground")}>{value}</p>
      <p className="mt-1 text-[11px] font-extrabold tracking-[0.06em] text-label-foreground">{label}</p>
    </div>
  );
}

function PagerButton({
  children,
  active,
  disabled,
  ariaLabel,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onPointerDown={spawnRipple}
      onClick={onClick}
      className={cn(
        "cr-ripple cr-press ds-ring inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-extrabold transition-colors disabled:pointer-events-none disabled:opacity-40",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

/** 1-based windowed pager: always shows 1, last, and current ±1 with ellipses. */
function pageWindow(page: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(count - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < count - 1) out.push("…");
  out.push(count);
  return out;
}
