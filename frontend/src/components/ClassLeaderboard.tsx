"use client";

import { useEffect, useState } from "react";
import { classesApi } from "@/lib/api";
import {
  Award,
  BarChart3,
  BookOpenCheck,
  Loader2,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

export type LeaderboardPayload = {
  classroom_id: number;
  classroom_name: string;
  student_count: number;
  practice_assignment_count: number;
  class_practice_average: number | null;
  overall_group_mean_of_assignments: number | null;
  assignments_summary: {
    assignment_id: number;
    title: string;
    due_at: string | null;
    created_at: string | null;
    practice_test_id: number | null;
    practice_test_title: string | null;
    subject: string | null;
    group_mean_score: number | null;
    completed_count: number;
    student_headcount: number;
    completion_rate_pct: number;
  }[];
  students: {
    rank: number;
    user_id: number;
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    latest_practice: {
      assignment_id: number;
      assignment_title: string;
      practice_test_title: string | null;
      subject: string | null;
      score: number | null;
      submitted_at: string | null;
      attempt_id: number | null;
      in_progress?: boolean;
    } | null;
    practice_average: number | null;
    practice_completed_count: number;
    practice_total_assigned: number;
  }[];
};

function formatSubject(s?: string | null) {
  if (!s) return "Practice";
  if (s === "READING_WRITING") return "R&W";
  if (s === "MATH") return "Math";
  return s;
}

function medal(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return null;
}

type Props = { classId: number };

export default function ClassLeaderboard({ classId }: Props) {
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const raw = await classesApi.getLeaderboard(classId);
        if (!cancelled) setData(raw as LeaderboardPayload);
      } catch (e: unknown) {
        const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        if (!cancelled) setError(typeof d === "string" ? d : "Could not load leaderboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-border bg-card/70 py-24 backdrop-blur-md">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-semibold text-muted-foreground">Loading leaderboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-surface-2 px-6 py-5 text-sm font-semibold text-foreground ring-1 ring-amber-500/25">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const hasPractice = data.practice_assignment_count > 0;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/35 bg-gradient-to-br from-primary via-[color-mix(in_srgb,var(--primary)_45%,var(--accent-cyan))] to-accent-cyan p-8 md:p-10 text-white shadow-[0_24px_80px_-12px_color-mix(in_oklab,var(--primary)_32%,transparent)]">
        <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(circle_at_20%_20%,white,transparent_50%),radial-gradient(circle_at_80%_80%,white,transparent_45%)]" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <div>
            <p className="text-white/80 text-xs font-black uppercase tracking-[0.2em] mb-2">Pastpaper leaderboard</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">{data.classroom_name}</h2>
            <p className="mt-2 text-white/85 text-sm md:text-base max-w-xl leading-relaxed">
              Rankings from completed practice tests linked to homework. Group means show how the class performed on each
              assigned pastpaper.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl bg-card/25 backdrop-blur-md border border-border px-5 py-3 min-w-[120px]">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/75">Students</p>
              <p className="text-2xl font-black tabular-nums">{data.student_count}</p>
            </div>
            <div className="rounded-2xl bg-card/25 backdrop-blur-md border border-border px-5 py-3 min-w-[120px]">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/75">Practice HW</p>
              <p className="text-2xl font-black tabular-nums">{data.practice_assignment_count}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="ui-card rounded-2xl p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-label-foreground">Class avg (students)</p>
          </div>
          <p className="text-3xl font-black tabular-nums text-foreground">
            {data.class_practice_average != null ? data.class_practice_average : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Mean of each student&apos;s average across practice homework</p>
        </div>
        <div className="ui-card rounded-2xl p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-cyan/15">
              <BarChart3 className="h-5 w-5 text-accent-cyan" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-label-foreground">Mean of HW means</p>
          </div>
          <p className="text-3xl font-black tabular-nums text-foreground">
            {data.overall_group_mean_of_assignments != null ? data.overall_group_mean_of_assignments : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Average of per-homework group means (where data exists)</p>
        </div>
        <div className="ui-card rounded-2xl p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
              <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-label-foreground">Roster</p>
          </div>
          <p className="text-3xl font-black tabular-nums text-foreground">{data.student_count}</p>
          <p className="mt-1 text-xs text-muted-foreground">Students in this class</p>
        </div>
        <div className="ui-card rounded-2xl p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <BookOpenCheck className="h-5 w-5 text-primary" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-label-foreground">Assignments</p>
          </div>
          <p className="text-3xl font-black tabular-nums text-foreground">{data.practice_assignment_count}</p>
          <p className="mt-1 text-xs text-muted-foreground">Homework items with a pastpaper test</p>
        </div>
      </div>

      {!hasPractice ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-2/80 p-10 text-center backdrop-blur-sm">
          <Target className="mx-auto mb-3 h-12 w-12 text-label-foreground" />
          <p className="text-lg font-bold text-foreground">No practice-test homework yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Teachers can create classwork and attach a <strong>Practice test ID</strong>. When students complete the test
            and link their attempt to the submission, scores and group means appear here.
          </p>
        </div>
      ) : (
        <>
          <section>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-black tracking-tight text-foreground">Group mean by homework</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.assignments_summary.map((a) => (
                <div
                  key={a.assignment_id}
                  className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/25 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="inline-flex items-center rounded-lg bg-surface-2 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        {formatSubject(a.subject)}
                      </span>
                      <h4 className="mt-2 font-extrabold leading-snug text-foreground">{a.title}</h4>
                      {a.practice_test_title ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">{a.practice_test_title}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-label-foreground">Group mean</p>
                      <p className="text-2xl font-black text-primary tabular-nums">
                        {a.group_mean_score != null ? a.group_mean_score : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-[11px] font-bold text-muted-foreground">
                      <span>Completion</span>
                      <span className="tabular-nums">
                        {a.completed_count}/{a.student_headcount} ({a.completion_rate_pct}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent-cyan transition-all duration-500"
                        style={{ width: `${Math.min(100, a.completion_rate_pct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-black tracking-tight text-foreground">Student rankings</h3>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Sorted by average score across all practice homework (completed attempts).{" "}
              <span className="font-semibold text-foreground">Latest assigned pastpaper</span> is the most recent homework
              with a linked practice test—each student&apos;s score on that assignment is highlighted.
            </p>
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm backdrop-blur-sm">
              <div className="divide-y divide-border">
                {data.students.map((s) => (
                  <div
                    key={s.user_id}
                    className="flex flex-col gap-4 p-4 transition-colors hover:bg-surface-2/80 md:flex-row md:items-center md:p-5"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 font-black text-lg text-foreground">
                        {medal(s.rank) ? (
                          <span className="text-2xl leading-none" aria-hidden>
                            {medal(s.rank)}
                          </span>
                        ) : (
                          <span className="text-sm tabular-nums text-label-foreground">#{s.rank}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-foreground">
                          {s.first_name || s.last_name
                            ? `${s.first_name} ${s.last_name}`.trim()
                            : s.username || s.email}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                        <p className="mt-1 text-[11px] text-label-foreground">
                          Avg {s.practice_average != null ? s.practice_average : "—"} · {s.practice_completed_count}/
                          {s.practice_total_assigned} pastpapers done
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:shrink-0">
                      <div className="min-w-[200px] rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 backdrop-blur-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                          Latest assigned pastpaper
                        </p>
                        {s.latest_practice ? (
                          <>
                            <p className="mt-1 line-clamp-2 text-sm font-bold text-foreground">
                              {s.latest_practice.assignment_title}
                            </p>
                            <div className="mt-2 flex items-baseline gap-2">
                              <span className="text-2xl font-black tabular-nums text-primary">
                                {s.latest_practice.score != null ? s.latest_practice.score : s.latest_practice.in_progress ? "…" : "—"}
                              </span>
                              <span className="text-xs font-semibold text-muted-foreground">
                                {s.latest_practice.score != null
                                  ? "score"
                                  : s.latest_practice.in_progress
                                    ? "in progress"
                                    : "not submitted"}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="mt-1 text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
