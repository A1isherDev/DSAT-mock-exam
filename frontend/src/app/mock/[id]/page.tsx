"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { examsApi } from "@/lib/api";
import { BookOpen, Calculator, CheckCircle2, ArrowLeft, Play, Eye, Trophy } from "lucide-react";
import Cookies from "js-cookie";


function MockExamDetailInner() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const midtermQuery = searchParams.get("midterm") === "1";
  const mockIdStr = String(id);
  const [mockExam, setMockExam] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingModuleId, setStartingModuleId] = useState<number | null>(null);
  const router = useRouter();

  const examIsMidterm = midtermQuery || mockExam?.kind === "MIDTERM";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = Cookies.get("access_token");
        const examData = await examsApi.getMockExam(Number(id));
        setMockExam(examData);
        if (token) {
          const attemptsData = await examsApi.getAttempts();
          setAttempts(attemptsData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const getOrCreateAttempt = async (testId: number) => {
    let attempt = attempts.find((a) => a.practice_test === testId && !a.is_expired && !a.is_completed);
    if (!attempt) {
      attempt = await examsApi.startTest(testId);
      setAttempts([...attempts, attempt]);
    }
    return attempt;
  };

  const handleStartModule = async (testId: number, moduleId: number, querySuffix = "") => {
    setStartingModuleId(moduleId);
    try {
      const attempt = await getOrCreateAttempt(testId);
      await examsApi.startModule(attempt.id, moduleId);
      router.push(`/exam/${attempt.id}${querySuffix}`);
    } catch (e) {
      console.error("Failed to start module", e);
      setStartingModuleId(null);
    }
  };

  const backHref = examIsMidterm ? "/midterm" : "/mock-exam";

  const { rwTest, mathTest, rwAttempt, mathAttempt, rwDone, mathDone, breakDone } = useMemo(() => {
    const tests = mockExam?.tests || [];
    const rw = tests.find((t: any) => t.subject === "READING_WRITING");
    const mt = tests.find((t: any) => t.subject === "MATH");
    const latest = (testId: number) =>
      attempts
        .filter((a) => a.practice_test === testId)
        .sort((a, b) => (b.id || 0) - (a.id || 0))[0];
    const rwa = rw ? latest(rw.id) : null;
    const ma = mt ? latest(mt.id) : null;
    let bd = false;
    try {
      if (typeof window !== "undefined" && rwa?.is_completed && rwa?.id) {
        bd =
          localStorage.getItem(`mastersat_mock_${mockIdStr}_break_done`) === "1" &&
          localStorage.getItem(`mastersat_mock_${mockIdStr}_break_after_rw`) === String(rwa.id);
      }
    } catch {
      bd = false;
    }
    return {
      rwTest: rw,
      mathTest: mt,
      rwAttempt: rwa,
      mathAttempt: ma,
      rwDone: !!rwa?.is_completed,
      mathDone: !!ma?.is_completed,
      breakDone: bd,
    };
  }, [mockExam, attempts, mockIdStr]);

  const startFullMockRw = async () => {
    if (!rwTest?.modules?.[0]?.id) return;
    const q = `?mockFlow=1&mockExamId=${mockIdStr}`;
    await handleStartModule(rwTest.id, rwTest.modules[0].id, q);
  };

  const startMathAfterBreak = async () => {
    if (!mathTest?.modules?.[0]?.id || !rwAttempt?.id) return;
    const q = `?mockFlow=1&mockExamId=${mockIdStr}&rwAttempt=${rwAttempt.id}`;
    await handleStartModule(mathTest.id, mathTest.modules[0].id, q);
  };

  const renderTestCard = (test: any) => {
    if (!test) return null;
    const isRW = test.subject === "READING_WRITING";
    const Icon = isRW ? BookOpen : Calculator;
    const label = isRW ? "Reading & Writing" : "Mathematics";
    const modules = test.modules || [];
    const attempt = attempts
      .filter((a) => a.practice_test === test.id)
      .sort((a, b) => (b.id || 0) - (a.id || 0))[0];
    const isCompleted = attempt?.is_completed;

    return (
      <div
        key={test.id}
        className={`group p-6 rounded-[32px] border-2 transition-all duration-500 ${
          isRW ? "border-blue-50 bg-white hover:border-blue-400" : "border-emerald-50 bg-white hover:border-emerald-400"
        } shadow-sm hover:shadow-2xl hover:shadow-slate-200/50 relative overflow-hidden flex flex-col gap-6`}
      >
        {isCompleted && (
          <div className="absolute top-5 right-5 flex items-center gap-2 px-3 py-1.5 bg-[#10b981] text-white rounded-xl shadow-lg shadow-emerald-100/50 z-20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Completed</span>
          </div>
        )}

        <div className="flex items-start gap-5">
          <div
            className={`p-5 rounded-[24px] transition-all duration-500 shrink-0 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100/50 group-hover:shadow-xl group-hover:-translate-y-1 ${
              isRW ? "text-blue-600" : "text-emerald-600"
            } relative`}
          >
            <Icon className="w-9 h-9 relative z-10" />
          </div>

          <div className="flex flex-col gap-2.5 pt-1 min-w-0 pr-10">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none break-words">{label}</h3>
            {test.label && (
              <span className="bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest w-fit">
                {test.label}
              </span>
            )}
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {modules.length} Modules • {modules.reduce((acc: number, m: any) => acc + m.time_limit_minutes, 0)}m
            </div>
          </div>
        </div>

        <div className="mt-auto">
          {isCompleted ? (
            <button
              type="button"
              onClick={() => router.push(`/review/${attempt.id}`)}
              className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-[18px] font-black transition-all duration-300 shadow-xl shadow-slate-200 active:scale-[0.98] uppercase tracking-widest text-[10px]"
            >
              <Eye className="w-4 h-4" /> REVIEW
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleStartModule(test.id, modules[0]?.id, "?midterm=1")}
              disabled={startingModuleId !== null}
              className={`w-full flex items-center justify-center gap-4 py-5 rounded-[18px] font-black transition-all duration-300 shadow-xl active:scale-[0.98] ${
                isRW
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200"
              }`}
            >
              {startingModuleId === modules[0]?.id ? (
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                  <span className="text-xs tracking-[0.1em]">{attempt ? "RESUME" : "START"}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f8f9fb]">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push(backHref)}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold transition-colors"
            >
              <ArrowLeft className="w-5 h-5" /> Back
            </button>
            <div className="text-right">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">{mockExam?.title}</h1>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                {examIsMidterm ? "Midterm" : "Full mock SAT"}
              </p>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-12">
          {!examIsMidterm && rwTest && mathTest ? (
            <div className="space-y-8">
              <div>
                <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Full mock exam</h2>
                <p className="text-slate-500 font-medium text-lg max-w-2xl">
                  This is the <strong>one full mock</strong> (not separate sectional runs). Reading &amp; Writing first, then a
                  required 10-minute break, then Math—no pause. Total score out of 1600. To practice R&amp;W or Math alone with
                  pause, use <strong>Practice Tests</strong>.
                </p>
              </div>

              {mathDone ? (
                <div className="bg-white rounded-3xl border border-slate-200 p-10 shadow-sm text-center">
                  <Trophy className="w-14 h-14 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-black text-slate-900 mb-2">Mock complete</h3>
                  <p className="text-slate-600 mb-8">View your combined Reading &amp; Writing and Math scores.</p>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/mock/${mockIdStr}/results?rwAttempt=${rwAttempt?.id || ""}&mathAttempt=${mathAttempt?.id || ""}`
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 bg-slate-900 text-white font-black px-8 py-4 rounded-2xl text-sm uppercase tracking-widest hover:bg-indigo-600 transition-colors"
                  >
                    See results (1600 scale)
                  </button>
                </div>
              ) : !rwDone ? (
                <div className="bg-white rounded-3xl border-2 border-blue-100 p-10 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div>
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Step 1</p>
                      <h3 className="text-2xl font-black text-slate-900">Reading &amp; Writing</h3>
                      <p className="text-slate-500 mt-2">Starts both modules of this section in one session.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startFullMockRw()}
                      disabled={startingModuleId !== null}
                      className="shrink-0 flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-black px-10 py-5 rounded-2xl text-xs uppercase tracking-widest shadow-lg disabled:opacity-60"
                    >
                      {startingModuleId !== null ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Play className="w-5 h-5 fill-current" />
                          {rwAttempt ? "Resume Reading & Writing" : "Start mock (English first)"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : rwDone && !breakDone ? (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-10 text-center">
                  <h3 className="text-xl font-black text-slate-900 mb-2">10-minute break</h3>
                  <p className="text-slate-600 mb-6">
                    Before Math, complete the scheduled break. You will not be able to skip the timer.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push(`/mock/${mockIdStr}/break?rwAttempt=${rwAttempt?.id || ""}`)}
                    className="inline-flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-white font-black px-8 py-4 rounded-2xl text-sm uppercase tracking-widest"
                  >
                    Start break
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-3xl border-2 border-emerald-100 p-10 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div>
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Step 2</p>
                      <h3 className="text-2xl font-black text-slate-900">Mathematics</h3>
                      <p className="text-slate-500 mt-2">
                        Opens automatically when the break timer ends. Use the button only if it did not open. Pause is not
                        available.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startMathAfterBreak()}
                      disabled={startingModuleId !== null}
                      className="shrink-0 flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-10 py-5 rounded-2xl text-xs uppercase tracking-widest shadow-lg disabled:opacity-60"
                    >
                      {startingModuleId !== null ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Play className="w-5 h-5 fill-current" />
                          {mathAttempt && !mathDone ? "Resume Math" : "Start Math"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-12">
                <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Sections</h2>
                <p className="text-slate-500 font-medium text-lg max-w-2xl">
                  {examIsMidterm
                    ? "Midterm: calculator and reference sheet are hidden. Your teacher or admin set the time and modules."
                    : ""}
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {(mockExam?.tests || [])
                  .slice()
                  .sort((a: any, b: any) => (a.subject === "READING_WRITING" ? -1 : 1))
                  .map((test: any) => renderTestCard(test))}
                {(!mockExam?.tests || mockExam.tests.length === 0) && (
                  <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center">
                    <p className="text-slate-400 font-bold">No sections available yet.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}

export default function MockExamDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb]">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MockExamDetailInner />
    </Suspense>
  );
}
