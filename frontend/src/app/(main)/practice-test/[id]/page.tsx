"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { examsApi } from "@/lib/api";
import { BookOpen, Calculator, CheckCircle2, ArrowLeft, Play, Eye } from "lucide-react";
import Cookies from "js-cookie";

function PracticeTestDetailInner() {
  const { id } = useParams();
  const testId = Number(id);
  const [test, setTest] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingModuleId, setStartingModuleId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        const token = Cookies.get("access_token");
        const data = await examsApi.getPracticeTest(testId);
        setTest(data);
        if (token) {
          const attemptsData = await examsApi.getAttempts();
          setAttempts(attemptsData);
        }
      } catch (e) {
        console.error(e);
        setTest(null);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [testId]);

  const getOrCreateAttempt = async () => {
    let attempt = attempts.find((a) => a.practice_test === testId && !a.is_expired && !a.is_completed);
    if (!attempt) {
      attempt = await examsApi.startTest(testId);
      setAttempts([...attempts, attempt]);
    }
    return attempt;
  };

  const handleStartModule = async (moduleId: number) => {
    setStartingModuleId(moduleId);
    try {
      const attempt = await getOrCreateAttempt();
      await examsApi.startModule(attempt.id, moduleId);
      router.push(`/exam/${attempt.id}`);
    } catch (e) {
      console.error(e);
      setStartingModuleId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!test) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex flex-col items-center justify-center px-6">
          <p className="text-slate-600 font-bold mb-4">Practice test not found or not assigned to you.</p>
          <button type="button" className="text-emerald-600 font-bold" onClick={() => router.push("/practice-tests")}>
            Back to practice tests
          </button>
        </div>
      </AuthGuard>
    );
  }

  const isRW = test.subject === "READING_WRITING";
  const Icon = isRW ? BookOpen : Calculator;
  const label = isRW ? "Reading & Writing" : "Mathematics";
  const modules = test.modules || [];
  const attempt = attempts
    .filter((a) => a.practice_test === test.id)
    .sort((a, b) => (b.id || 0) - (a.id || 0))[0];
  const isCompleted = attempt?.is_completed;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f8f9fb] dark:bg-slate-950">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 h-16 flex items-center">
            <button
              type="button"
              onClick={() => router.push("/practice-tests")}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-bold transition-colors"
            >
              <ArrowLeft className="w-5 h-5" /> Back
            </button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-12">
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-2xl">
            Sectional practice—you can pause the timer. This is not the full mock; for one continuous SAT run with break and
            no pause, use <strong>Mock Exam</strong> (only if an admin has assigned that mock to you there).
            {test.mock_exam?.title ? (
              <span className="block mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Section from mock pack: {test.mock_exam.title}
              </span>
            ) : null}
          </p>
          <div className="max-w-xl">
            <div
              className={`group p-6 rounded-[32px] border-2 transition-all duration-500 ${
                isRW
                  ? "border-primary/15 bg-card dark:border-primary/25"
                  : "border-emerald-500/20 bg-card dark:border-emerald-500/25"
              } shadow-sm flex flex-col gap-6`}
            >
              {isCompleted && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white rounded-xl w-fit text-[9px] font-black uppercase tracking-widest">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Completed
                </div>
              )}
              <div className="flex items-start gap-5">
                <div
                  className={`p-5 rounded-[24px] shrink-0 bg-white dark:bg-slate-800 shadow-md border border-slate-100 dark:border-slate-700 ${
                    isRW ? "text-blue-600" : "text-emerald-600"
                  }`}
                >
                  <Icon className="w-9 h-9" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-foreground">{label}</h2>
                  {test.label && (
                    <span className="mt-2 inline-block rounded-lg bg-foreground px-2 py-1 text-[9px] font-black uppercase text-background">
                      {test.label}
                    </span>
                  )}
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-label-foreground">
                    {test.form_type === "US" ? "US Form" : "International"} · {modules.length} modules ·{" "}
                    {modules.reduce((acc: number, m: any) => acc + m.time_limit_minutes, 0)} min
                  </p>
                </div>
              </div>
              <div className="mt-auto">
                {isCompleted ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/review/${attempt.id}`)}
                    className="flex w-full items-center justify-center gap-3 rounded-[18px] bg-foreground py-4 text-[10px] font-black uppercase tracking-widest text-background hover:opacity-90"
                  >
                    <Eye className="w-4 h-4" /> Review
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartModule(modules[0]?.id)}
                    disabled={startingModuleId !== null || !modules[0]?.id}
                    className={`ms-btn-primary flex w-full items-center justify-center gap-4 rounded-[18px] py-5 text-xs font-black uppercase tracking-widest shadow-xl ${
                      isRW ? "ms-cta-fill text-white" : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {startingModuleId === modules[0]?.id ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Play className="w-5 h-5 fill-current" />
                        {attempt ? "Resume" : "Start"}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

export default function PracticeTestDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb]">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PracticeTestDetailInner />
    </Suspense>
  );
}
