"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { ArrowLeft, Timer } from "lucide-react";

const BREAK_SECONDS = 10 * 60;

function BreakInner() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rwAttempt = searchParams.get("rwAttempt") || "";
  const mockId = String(id);
  const [left, setLeft] = useState(BREAK_SECONDS);

  useEffect(() => {
    if (!rwAttempt) {
      router.replace(`/mock/${mockId}`);
      return;
    }
    const t = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          try {
            localStorage.setItem(`mastersat_mock_${mockId}_break_done`, "1");
            if (rwAttempt) {
              localStorage.setItem(`mastersat_mock_${mockId}_break_after_rw`, rwAttempt);
            }
          } catch {
            /* ignore */
          }
          router.replace(`/mock/${mockId}`);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [mockId, rwAttempt, router]);

  const mm = Math.floor(left / 60);
  const ss = left % 60;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6">
        <button
          type="button"
          onClick={() => router.push(`/mock/${mockId}`)}
          className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 hover:text-white text-sm font-bold"
        >
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <Timer className="w-16 h-16 text-amber-400 mb-6" />
        <h1 className="text-3xl font-black tracking-tight text-center mb-2">Scheduled break</h1>
        <p className="text-slate-400 text-center max-w-md mb-10 font-medium">
          Reading & Writing is complete. The digital SAT includes a 10-minute break before Math. Stay on this
          screen until the timer finishes.
        </p>
        <div className="text-6xl font-mono font-black tabular-nums text-amber-300">
          {mm}:{ss.toString().padStart(2, "0")}
        </div>
        <p className="mt-8 text-xs font-bold text-slate-500 uppercase tracking-widest">Pause is not available during the mock</p>
      </div>
    </AuthGuard>
  );
}

export default function MockBreakPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <BreakInner />
    </Suspense>
  );
}
