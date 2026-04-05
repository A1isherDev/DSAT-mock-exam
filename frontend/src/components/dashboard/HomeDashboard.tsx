"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { classesApi, examsApi, usersApi } from "@/lib/api";
import { ArrowRight, BarChart3, Calendar, Pencil, PlayCircle, Target, TrendingUp } from "lucide-react";
import { ClassroomButton } from "@/components/classroom";
import { DashboardCard, DashboardEyebrow, DashboardTitle } from "./DashboardCard";
import { LearningRoadmap, type RoadmapStep } from "./LearningRoadmap";
import { cn } from "@/lib/cn";

type Attempt = {
  id: number;
  submitted_at?: string | null;
  is_completed?: boolean;
  score?: number | null;
  practice_test_details?: { subject?: string; title?: string };
};

type Me = {
  first_name?: string;
  last_name?: string;
  sat_exam_date?: string | null;
  target_score?: number | null;
  last_mock_result?: {
    score: number | null;
    mock_exam_title?: string | null;
    practice_test_subject?: string | null;
    completed_at?: string | null;
  } | null;
};

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return Math.ceil((t.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function HomeDashboard() {
  const router = useRouter();
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [classCount, setClassCount] = useState(0);

  useEffect(() => {
    setHasToken(!!Cookies.get("access_token"));
  }, []);

  useEffect(() => {
    if (!hasToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [meData, rawAttempts, classes] = await Promise.all([
          usersApi.getMe(),
          examsApi.getAttempts().catch(() => []),
          classesApi.list().catch(() => []),
        ]);
        if (cancelled) return;
        setMe(meData as Me);
        setAttempts(Array.isArray(rawAttempts) ? (rawAttempts as Attempt[]) : []);
        setClassCount(Array.isArray(classes) ? classes.length : 0);
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  const incomplete = useMemo(
    () => attempts.find((a) => !a.is_completed) || null,
    [attempts],
  );

  const weeklyBuckets = useMemo(() => {
    const days = [0, 0, 0, 0, 0, 0, 0];
    const now = startOfDay(new Date());
    const dayMs = 86400000;
    for (const a of attempts) {
      if (!a.is_completed || !a.submitted_at) continue;
      const t = startOfDay(new Date(a.submitted_at));
      const diff = Math.round((now - t) / dayMs);
      if (diff >= 0 && diff < 7) days[6 - diff] += 1;
    }
    const max = Math.max(1, ...days);
    return days.map((n) => ({ n, h: Math.round((n / max) * 100) }));
  }, [attempts]);

  const firstName = me?.first_name?.trim() || "there";
  const examDays = daysUntil(me?.sat_exam_date ?? null);
  const target = me?.target_score ?? null;
  const mockScore = me?.last_mock_result?.score ?? null;
  const trend =
    target != null && mockScore != null
      ? mockScore >= target
        ? { label: "On or above target", up: true }
        : { label: `${target - mockScore} pts to goal`, up: false }
      : { label: "Set target in Profile", up: null as boolean | null };

  const profileFieldsFilled = useMemo(() => {
    if (!me) return 0;
    let n = 0;
    const t = 4;
    if (me.first_name) n++;
    if (me.last_name) n++;
    if (me.sat_exam_date) n++;
    if (me.target_score != null) n++;
    return Math.round((n / t) * 100);
  }, [me]);

  const roadmapSteps: RoadmapStep[] = useMemo(
    () => [
      {
        id: "profile",
        label: "Profile & goals",
        description: "Exam date and target score",
        href: "/profile",
        done: profileFieldsFilled >= 75,
      },
      {
        id: "practice",
        label: "Pastpaper practice",
        description: "Untimed sections from your library",
        href: "/practice-tests",
        done: attempts.some((a) => a.is_completed),
      },
      {
        id: "mock",
        label: "Timed mock",
        description: "Full diagnostic under test rules",
        href: "/mock-exam",
        done: !!me?.last_mock_result,
      },
      {
        id: "classes",
        label: "Classes",
        description: "Homework and cohort progress",
        href: "/classes",
        done: classCount > 0,
      },
    ],
    [attempts, classCount, me?.last_mock_result, profileFieldsFilled],
  );

  if (!hasToken) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <DashboardCard accent="blue" padding="lg">
          <DashboardEyebrow>MasterSAT</DashboardEyebrow>
          <DashboardTitle className="mt-2">Sign in for your dashboard</DashboardTitle>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Track countdown, resume tests, and see weekly activity in one place.
          </p>
          <ClassroomButton variant="primary" size="md" className="mt-6 w-full" onClick={() => router.push("/login")}>
            Sign in
          </ClassroomButton>
        </DashboardCard>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-3 py-6 md:px-4 lg:px-6">
        <div className="mb-8 h-10 max-w-md ds-skeleton rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-44 rounded-2xl ds-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 md:px-4 lg:px-6">
      <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Overview</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-3xl">
            Hi, {firstName}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">
            Resume where you left off, watch the countdown, and follow the roadmap—no clutter, just signal.
          </p>
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:border-blue-300 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-blue-500/50"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit goals
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {/* Continue learning */}
        <DashboardCard accent="blue" padding="md" className="lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <DashboardEyebrow>Resume</DashboardEyebrow>
              <DashboardTitle className="mt-1">Continue learning</DashboardTitle>
              {incomplete ? (
                <>
                  <p className="mt-2 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {incomplete.practice_test_details?.title || "Practice test"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {incomplete.practice_test_details?.subject === "MATH"
                      ? "Math"
                      : incomplete.practice_test_details?.subject === "READING_WRITING"
                        ? "Reading & Writing"
                        : "In progress"}
                    {" · "}
                    Pick up where you stopped
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  No active attempt. Start a pastpaper or mock when you&apos;re ready.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              {incomplete ? (
                <Link
                  href={`/exam/${incomplete.id}`}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white",
                    "bg-blue-600 shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500",
                  )}
                >
                  <PlayCircle className="h-4 w-4" />
                  Resume
                </Link>
              ) : (
                <Link
                  href="/practice-tests"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/90 px-4 py-2.5 text-sm font-bold text-slate-800 transition-all hover:bg-slate-50 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
                >
                  Browse tests
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </DashboardCard>

        {/* Exam countdown — highlight */}
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border p-5 md:p-6",
            "border-blue-600/40 bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-xl shadow-blue-900/30",
            "dark:border-blue-500/50 dark:from-blue-700 dark:to-black",
          )}
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 left-1/4 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
          <DashboardEyebrow className="text-white/80">Exam countdown</DashboardEyebrow>
          <div className="relative mt-2 flex items-baseline gap-2">
            <Calendar className="h-5 w-5 shrink-0 opacity-90" />
            <span className="text-4xl font-black tabular-nums tracking-tight md:text-5xl">
              {examDays == null ? "—" : examDays < 0 ? "0" : examDays}
            </span>
            <span className="text-sm font-bold uppercase tracking-wider text-white/90">days</span>
          </div>
          <p className="relative mt-2 text-sm font-medium text-white/85">
            {me?.sat_exam_date
              ? `Until ${new Date(me.sat_exam_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : "Add your exam date in Profile"}
          </p>
          <Link
            href="/profile"
            className="relative mt-4 inline-flex items-center gap-1 text-xs font-bold text-white/90 underline-offset-4 hover:underline"
          >
            {me?.sat_exam_date ? "Adjust date" : "Set date"}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Performance */}
        <DashboardCard accent="blue" padding="md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DashboardEyebrow>Performance</DashboardEyebrow>
              <DashboardTitle className="mt-1">Last mock vs goal</DashboardTitle>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <span className="text-3xl font-black tabular-nums text-slate-900 dark:text-white">
              {mockScore != null ? mockScore : "—"}
            </span>
            <span className="pb-1 text-sm font-semibold text-slate-400">/ {target ?? "—"}</span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">target</span>
          </div>
          <div
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold",
              trend.up === true && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
              trend.up === false && "bg-amber-500/15 text-amber-800 dark:text-amber-200",
              trend.up === null && "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
            )}
          >
            {trend.up === true ? <TrendingUp className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
            {trend.label}
          </div>
        </DashboardCard>

        {/* Weekly activity */}
        <DashboardCard accent="blue" padding="md" className="md:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DashboardEyebrow>Activity</DashboardEyebrow>
              <DashboardTitle className="mt-1">Weekly completions</DashboardTitle>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Finished practice attempts submitted in the last 7 days
              </p>
            </div>
            <BarChart3 className="h-5 w-5 text-blue-500 dark:text-blue-400" />
          </div>
          <div className="mt-6 flex h-28 items-end justify-between gap-2 border-t border-slate-100 pt-4 dark:border-white/[0.06]">
            {weeklyBuckets.map((d, i) => {
              const labels = ["-6d", "-5d", "-4d", "-3d", "-2d", "-1d", "Today"];
              return (
                <div key={labels[i]} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-24 w-full max-w-[2.5rem] items-end justify-center">
                    <div
                      className={cn(
                        "w-full max-w-[2rem] rounded-t-md transition-all duration-300",
                        d.n > 0
                          ? "bg-gradient-to-t from-blue-700 to-blue-500 dark:from-blue-600 dark:to-blue-400"
                          : "bg-slate-100 dark:bg-white/10",
                      )}
                      style={{ height: `${Math.max(8, d.h)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {labels[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </DashboardCard>

        {/* Roadmap */}
        <LearningRoadmap steps={roadmapSteps} />
      </div>

    </div>
  );
}
