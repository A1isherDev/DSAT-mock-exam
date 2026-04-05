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
      <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-3xl border border-slate-200/80 bg-white/60 backdrop-blur-sm">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-sm font-semibold text-slate-500">Loading leaderboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-red-800 font-semibold text-sm">{error}</div>
    );
  }

  if (!data) return null;

  const hasPractice = data.practice_assignment_count > 0;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-blue-300/50 bg-gradient-to-br from-blue-600 via-blue-500 to-sky-500 p-8 md:p-10 text-white shadow-[0_24px_80px_-12px_rgba(37,99,235,0.4)]">
        <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(circle_at_20%_20%,white,transparent_50%),radial-gradient(circle_at_80%_80%,white,transparent_45%)]" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <div>
            <p className="text-blue-100 text-xs font-black uppercase tracking-[0.2em] mb-2">Pastpaper leaderboard</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">{data.classroom_name}</h2>
            <p className="mt-2 text-blue-100/90 text-sm md:text-base max-w-xl leading-relaxed">
              Rankings from completed practice tests linked to homework. Group means show how the class performed on each
              assigned pastpaper.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 px-5 py-3 min-w-[120px]">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-100/80">Students</p>
              <p className="text-2xl font-black tabular-nums">{data.student_count}</p>
            </div>
            <div className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 px-5 py-3 min-w-[120px]">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-100/80">Practice HW</p>
              <p className="text-2xl font-black tabular-nums">{data.practice_assignment_count}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Class avg (students)</p>
          </div>
          <p className="text-3xl font-black text-slate-900 tabular-nums">
            {data.class_practice_average != null ? data.class_practice_average : "—"}
          </p>
          <p className="text-xs text-slate-500 mt-1">Mean of each student&apos;s average across practice homework</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Mean of HW means</p>
          </div>
          <p className="text-3xl font-black text-slate-900 tabular-nums">
            {data.overall_group_mean_of_assignments != null ? data.overall_group_mean_of_assignments : "—"}
          </p>
          <p className="text-xs text-slate-500 mt-1">Average of per-homework group means (where data exists)</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Roster</p>
          </div>
          <p className="text-3xl font-black text-slate-900 tabular-nums">{data.student_count}</p>
          <p className="text-xs text-slate-500 mt-1">Students in this class</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
              <BookOpenCheck className="w-5 h-5 text-sky-600" />
            </div>
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Assignments</p>
          </div>
          <p className="text-3xl font-black text-slate-900 tabular-nums">{data.practice_assignment_count}</p>
          <p className="text-xs text-slate-500 mt-1">Homework items with a pastpaper test</p>
        </div>
      </div>

      {!hasPractice ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-10 text-center">
          <Target className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-700 font-bold text-lg">No practice-test homework yet</p>
          <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
            Teachers can create classwork and attach a <strong>Practice test ID</strong>. When students complete the test
            and link their attempt to the submission, scores and group means appear here.
          </p>
        </div>
      ) : (
        <>
          <section>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Group mean by homework</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.assignments_summary.map((a) => (
                <div
                  key={a.assignment_id}
                  className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm hover:border-blue-200 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-wider">
                        {formatSubject(a.subject)}
                      </span>
                      <h4 className="font-extrabold text-slate-900 mt-2 leading-snug">{a.title}</h4>
                      {a.practice_test_title ? (
                        <p className="text-xs text-slate-500 mt-1 truncate">{a.practice_test_title}</p>
                      ) : null}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Group mean</p>
                      <p className="text-2xl font-black text-blue-600 tabular-nums">
                        {a.group_mean_score != null ? a.group_mean_score : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                      <span>Completion</span>
                      <span className="tabular-nums">
                        {a.completed_count}/{a.student_headcount} ({a.completion_rate_pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-400 to-sky-300 transition-all duration-500"
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
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Student rankings</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Sorted by average score across all practice homework (completed attempts).{" "}
              <span className="font-semibold text-slate-700">Latest assigned pastpaper</span> is the most recent homework
              with a linked practice test—each student&apos;s score on that assignment is highlighted.
            </p>
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-sm">
              <div className="divide-y divide-slate-100">
                {data.students.map((s) => (
                  <div
                    key={s.user_id}
                    className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 font-black text-lg shrink-0">
                        {medal(s.rank) ? (
                          <span className="text-2xl leading-none" aria-hidden>
                            {medal(s.rank)}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-sm tabular-nums">#{s.rank}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-extrabold text-slate-900 truncate">
                          {s.first_name || s.last_name
                            ? `${s.first_name} ${s.last_name}`.trim()
                            : s.username || s.email}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{s.email}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Avg {s.practice_average != null ? s.practice_average : "—"} · {s.practice_completed_count}/
                          {s.practice_total_assigned} pastpapers done
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:shrink-0">
                      <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 min-w-[200px]">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600/80">
                          Latest assigned pastpaper
                        </p>
                        {s.latest_practice ? (
                          <>
                            <p className="text-sm font-bold text-slate-800 mt-1 line-clamp-2">
                              {s.latest_practice.assignment_title}
                            </p>
                            <div className="flex items-baseline gap-2 mt-2">
                              <span className="text-2xl font-black text-blue-700 tabular-nums">
                                {s.latest_practice.score != null ? s.latest_practice.score : s.latest_practice.in_progress ? "…" : "—"}
                              </span>
                              <span className="text-xs font-semibold text-slate-500">
                                {s.latest_practice.score != null
                                  ? "score"
                                  : s.latest_practice.in_progress
                                    ? "in progress"
                                    : "not submitted"}
                              </span>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-slate-500 mt-1">—</p>
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
