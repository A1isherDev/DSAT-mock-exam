"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { examsStudentApi } from "@/features/examsStudent/api";
import { useAuthCriticalGate } from "@/hooks/useAuthCriticalGate";
import { ArrowLeft, BookOpen, Calculator, Loader2 } from "lucide-react";

type PackSection = {
  id: number;
  title: string;
  subject: string;
  module_count: number;
};

type Pack = {
  id: number;
  title: string;
  description: string;
  sections: PackSection[];
};

type AttemptRow = {
  id: number;
  practice_test: number;
  is_completed: boolean;
  is_expired: boolean;
  score?: number | null;
};

function isRWSubject(s: string): boolean {
  return s === "READING_WRITING";
}

function subjectLabel(s: string): string {
  if (s === "READING_WRITING") return "Reading & Writing";
  if (s === "MATH") return "Mathematics";
  return s;
}

export default function PracticeTestPackDetailPage() {
  const params = useParams();
  const router = useRouter();
  const packId = Number(Array.isArray(params.packId) ? params.packId[0] : params.packId);
  const { assertCriticalAuth } = useAuthCriticalGate();

  const [pack, setPack] = useState<Pack | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(packId) || packId <= 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [packData, attemptsData] = await Promise.all([
          examsStudentApi.getPracticeTestPackStudent(packId),
          examsStudentApi.getAttempts().catch(() => []),
        ]);
        if (!cancelled) {
          setPack(packData as Pack);
          const ad = attemptsData as unknown;
          const raw = Array.isArray(ad) ? ad
            : Array.isArray((ad as { results?: unknown[] })?.results) ? (ad as { results: AttemptRow[] }).results
            : [];
          setAttempts(raw as AttemptRow[]);
        }
      } catch {
        if (!cancelled) setError("Could not load practice test.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [packId]);

  const handleStart = async (sectionId: number) => {
    if (!assertCriticalAuth()) return;
    setStarting(sectionId);
    try {
      let attempt = attempts.find(
        (a) => a.practice_test === sectionId && !a.is_completed && !a.is_expired,
      );
      if (!attempt) {
        attempt = (await examsStudentApi.startTest(sectionId)) as AttemptRow;
        setAttempts((prev) => [...prev, attempt!]);
      }
      try {
        sessionStorage.setItem(`mastersat.attempt.bootstrap.${attempt.id}`, JSON.stringify(attempt));
      } catch {}
      router.push(`/exam/${attempt.id}`);
    } catch (e) {
      console.error("[practice-test] start section failed", e);
      setStarting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="font-bold text-foreground">{error ?? "Practice test not found."}</p>
        <Link href="/practice-tests" className="text-sm font-semibold text-primary hover:underline">
          Back to practice tests
        </Link>
      </div>
    );
  }

  const sorted = [...pack.sections].sort((a, b) =>
    (isRWSubject(a.subject) ? 0 : 1) - (isRWSubject(b.subject) ? 0 : 1)
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <Link
        href="/practice-tests"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to practice tests
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-foreground">
          {pack.title || `Practice Test #${pack.id}`}
        </h1>
        {pack.description && (
          <p className="mt-2 text-sm text-muted-foreground">{pack.description}</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Start any section in any order. No time restrictions between sections.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No sections available yet.
        </div>
      ) : (
        <div className="grid gap-4">
          {sorted.map((section) => {
            const rw = isRWSubject(section.subject);
            const Icon = rw ? BookOpen : Calculator;
            const iconColor = rw ? "text-primary" : "text-emerald-600";
            const iconBg = rw ? "bg-primary/8" : "bg-emerald-50";
            const borderColor = rw ? "border-primary/20" : "border-emerald-200";
            const ctaClass = rw
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-emerald-600 text-white hover:bg-emerald-700";

            const sectionAttempts = attempts
              .filter((a) => a.practice_test === section.id)
              .sort((a, b) => b.id - a.id);
            const completedAttempt = sectionAttempts.find((a) => a.is_completed);
            const activeAttempt = sectionAttempts.find((a) => !a.is_completed && !a.is_expired);
            const isCompleted = !!completedAttempt;
            const isLoading = starting === section.id;

            return (
              <div key={section.id} className={`rounded-2xl border-2 ${borderColor} bg-card p-5 flex flex-col gap-4`}>
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 rounded-2xl p-3 ${iconBg}`}>
                    <Icon className={`h-6 w-6 ${iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-extrabold text-foreground">{subjectLabel(section.subject)}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {section.module_count} module{section.module_count !== 1 ? "s" : ""}
                    </p>
                    {isCompleted && (
                      <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        Completed{completedAttempt?.score != null ? ` · ${completedAttempt.score}` : ""}
                      </span>
                    )}
                  </div>
                </div>

                {isCompleted ? (
                  <button
                    type="button"
                    onClick={() => handleStart(section.id)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Retake"}
                  </button>
                ) : activeAttempt ? (
                  <button
                    type="button"
                    onClick={() => handleStart(section.id)}
                    disabled={isLoading}
                    className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${ctaClass}`}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Resume"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStart(section.id)}
                    disabled={isLoading}
                    className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${ctaClass}`}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Start"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
