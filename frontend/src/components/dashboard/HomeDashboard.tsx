"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { classesApi, examsApi, usersApi } from "@/lib/api";
import { ArrowRight, BarChart3, Calendar, Pencil, PlayCircle, Target, TrendingUp } from "lucide-react";
import { ClassroomButton } from "@/components/classroom";
import { DashboardCard, DashboardEyebrow, DashboardTitle } from "./DashboardCard";
import { GoalScoreModal, initialSectionsFromTarget } from "./GoalScoreModal";
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
  id?: number;
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

const SECTION_GOALS_KEY = (userId: number) => `mastersat.sectionGoals.${userId}`;

function readStoredSectionGoals(
  userId: number | undefined,
  target: number | null,
): { math: number; english: number } | null {
  if (userId == null || target == null || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SECTION_GOALS_KEY(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as { math?: unknown; english?: unknown; total?: unknown };
    if (typeof p.math !== "number" || typeof p.english !== "number" || typeof p.total !== "number") return null;
    if (p.total !== target) return null;
    return { math: p.math, english: p.english };
  } catch {
    return null;
  }
}

export function HomeDashboard() {
  const router = useRouter();
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [classCount, setClassCount] = useState(0);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);

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
  const sectionGoals = useMemo(
    () => readStoredSectionGoals(me?.id, target),
    [me?.id, target],
  );
  const goalModalInitial = useMemo(() => {
    const fromStore = readStoredSectionGoals(me?.id, target);
    if (fromStore) return fromStore;
    return initialSectionsFromTarget(target);
  }, [me?.id, target]);
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

  async function handleGoalSubmit(math: number, english: number) {
    if (me?.id == null) return;
    const total = math + english;
    setSavingGoal(true);
    try {
      const updated = await usersApi.patchMe({ target_score: total });
      try {
        localStorage.setItem(SECTION_GOALS_KEY(me.id), JSON.stringify({ math, english, total }));
      } catch {
        /* ignore quota */
      }
      setMe((prev) => (prev ? { ...prev, ...(updated as Me) } : prev));
      setGoalModalOpen(false);
    } finally {
      setSavingGoal(false);
    }
  }

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
        <DashboardCard accent="gold" padding="lg">
          <DashboardEyebrow>MasterSAT</DashboardEyebrow>
          <DashboardTitle className="mt-2">Sign in for your dashboard</DashboardTitle>
          <p className="mt-3 text-sm text-muted-foreground">
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
          <p className="text-sm font-semibold text-amber-800/90 dark:text-amber-400/90">Overview</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            Hi, {firstName}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Resume where you left off, watch the countdown, and follow the roadmap—no clutter, just signal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onClick={() => setGoalModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground shadow-sm transition-all hover:border-primary/30"
          >
            <Target className="h-3.5 w-3.5" />
            My goal score
          </button>
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground shadow-sm transition-all hover:border-primary/30"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit goals
          </Link>
        </div>
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
                  <p className="mt-2 truncate text-sm font-medium text-foreground">
                    {incomplete.practice_test_details?.title || "Practice test"}
                  </p>
                  <p className="text-xs text-muted-foreground">
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
                <p className="mt-2 text-sm text-muted-foreground">
                  No active attempt. Start a pastpaper or mock when you&apos;re ready.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              {incomplete ? (
                <Link
                  href={`/exam/${incomplete.id}`}
                  className="ms-btn-primary ms-cta-fill inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ring-1 ring-ds-gold/35"
                >
                  <PlayCircle className="h-4 w-4" />
                  Resume
                </Link>
              ) : (
                <Link
                  href="/practice-tests"
                  className="ms-btn-secondary inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:border-primary/30"
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
            "relative overflow-hidden rounded-2xl border p-5 md:p-6 text-white shadow-xl",
            "border-primary/40 bg-gradient-to-br from-primary via-[color-mix(in_srgb,var(--primary)_55%,var(--surface-2))] to-[color-mix(in_srgb,var(--ds-gold-bright)_45%,var(--primary))]",
            "shadow-[0_24px_48px_-12px_color-mix(in_oklab,var(--primary)_28%,transparent)]",
          )}
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-400/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 left-1/4 h-24 w-24 rounded-full bg-primary/8 blur-2xl" />
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-ds-gold/15 text-primary ring-1 ring-ds-gold/25">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <span className="text-3xl font-black tabular-nums text-foreground">
              {mockScore != null ? mockScore : "—"}
            </span>
            <span className="pb-1 text-sm font-semibold text-label-foreground">/ {target ?? "—"}</span>
            <span className="text-xs font-bold text-muted-foreground">target</span>
          </div>
          {sectionGoals && target != null ? (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              Goal: Math {sectionGoals.math} · English {sectionGoals.english} · Overall{" "}
              <span className="tabular-nums font-bold text-foreground">{target}</span>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setGoalModalOpen(true)}
            className="mt-3 text-xs font-bold text-primary underline-offset-4 hover:underline"
          >
            Set Math &amp; English targets
          </button>
          <div
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold",
              trend.up === true && "bg-primary/12 text-primary ring-1 ring-primary/20",
              trend.up === false && "bg-amber-500/15 text-amber-800 dark:text-amber-200",
              trend.up === null && "bg-surface-2 text-muted-foreground",
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
              <p className="mt-1 text-xs text-muted-foreground">
                Finished practice attempts submitted in the last 7 days
              </p>
            </div>
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-6 flex h-28 items-end justify-between gap-2 border-t border-border pt-4">
            {weeklyBuckets.map((d, i) => {
              const labels = ["-6d", "-5d", "-4d", "-3d", "-2d", "-1d", "Today"];
              return (
                <div key={labels[i]} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-24 w-full max-w-[2.5rem] items-end justify-center">
                    <div
                      className={cn(
                        "w-full max-w-[2rem] rounded-t-md transition-all duration-300",
                        d.n > 0
                          ? "bg-gradient-to-t from-[color-mix(in_srgb,var(--primary)_35%,var(--surface-2))] via-primary to-ds-gold"
                          : "bg-surface-2",
                      )}
                      style={{ height: `${Math.max(8, d.h)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-label-foreground">
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

      <GoalScoreModal
        open={goalModalOpen}
        onOpenChange={setGoalModalOpen}
        initialMath={goalModalInitial.math}
        initialEnglish={goalModalInitial.english}
        saving={savingGoal}
        onSubmit={handleGoalSubmit}
      />
    </div>
  );
}
