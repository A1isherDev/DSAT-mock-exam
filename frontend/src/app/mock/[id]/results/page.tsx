"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { examsApi } from "@/lib/api";
import { ArrowLeft, Trophy } from "lucide-react";

function ResultsInner() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mockId = Number(id);
  const [loading, setLoading] = useState(true);
  const [rwScore, setRwScore] = useState<number | null>(null);
  const [mathScore, setMathScore] = useState<number | null>(null);
  const [title, setTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mock = await examsApi.getMockExam(mockId);
        if (cancelled) return;
        setTitle(mock.title || "Mock exam");
        const rwTest = (mock.tests || []).find((t: any) => t.subject === "READING_WRITING");
        const mathTest = (mock.tests || []).find((t: any) => t.subject === "MATH");
        const rwParam = searchParams.get("rwAttempt");
        const mathParam = searchParams.get("mathAttempt");
        const attempts = await examsApi.getAttempts();
        if (cancelled) return;

        const pick = (testId: number | undefined, param: string | null) => {
          if (!testId) return null;
          if (param) {
            const a = attempts.find((x: any) => String(x.id) === param && x.practice_test === testId);
            if (a?.is_completed) return a;
          }
          const list = attempts
            .filter((a: any) => a.practice_test === testId && a.is_completed)
            .sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
          return list[0] || null;
        };

        const rwA = pick(rwTest?.id, rwParam);
        const mathA = pick(mathTest?.id, mathParam);
        setRwScore(rwA?.score ?? null);
        setMathScore(mathA?.score ?? null);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mockId, searchParams]);

  const total =
    rwScore != null && mathScore != null ? Math.min(1600, (rwScore || 0) + (mathScore || 0)) : null;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f8f9fb]">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push("/mock-exam")}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-sm"
            >
              <ArrowLeft className="w-5 h-5" /> Mock exams
            </button>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-16 text-center">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <Trophy className="w-16 h-16 text-amber-500 mx-auto mb-6" />
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Finished</p>
              <h1 className="text-3xl font-black text-slate-900 mb-2">{title}</h1>
              <p className="text-slate-600 font-medium mb-10">Your scores out of the SAT 1600 scale (800 + 800).</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">
                    Reading &amp; Writing
                  </p>
                  <p className="text-4xl font-black text-slate-900">{rwScore ?? "—"}</p>
                  <p className="text-xs text-slate-400 mt-1 font-bold">/ 800</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Math</p>
                  <p className="text-4xl font-black text-slate-900">{mathScore ?? "—"}</p>
                  <p className="text-xs text-slate-400 mt-1 font-bold">/ 800</p>
                </div>
              </div>
              <div className="bg-slate-900 text-white rounded-3xl p-10 shadow-xl">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total</p>
                <p className="text-5xl font-black tabular-nums">{total ?? "—"}</p>
                <p className="text-sm font-bold text-slate-400 mt-2">out of 1600</p>
              </div>
              <div className="mt-10 flex flex-wrap gap-3 justify-center">
                {searchParams.get("rwAttempt") && (
                  <button
                    type="button"
                    onClick={() => router.push(`/review/${searchParams.get("rwAttempt")}`)}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-white"
                  >
                    Review Reading &amp; Writing
                  </button>
                )}
                {searchParams.get("mathAttempt") && (
                  <button
                    type="button"
                    onClick={() => router.push(`/review/${searchParams.get("mathAttempt")}`)}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-white"
                  >
                    Review Math
                  </button>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}

export default function MockResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb]">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ResultsInner />
    </Suspense>
  );
}
