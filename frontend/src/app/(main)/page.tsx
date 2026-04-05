"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { usersApi } from "@/lib/api";
import { Calendar, Target, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ClassroomButton, DashboardSkeleton } from "@/components/classroom";

type Me = {
  sat_exam_date: string | null;
  target_score: number | null;
  last_mock_result: null | {
    score: number | null;
    mock_exam_title: string | null;
    practice_test_subject: string | null;
    completed_at: string | null;
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasToken, setHasToken] = useState(false);

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
        const data = await usersApi.getMe();
        if (!cancelled) setMe(data);
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

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  const subjectLabel = (s: string | null | undefined) => {
    if (!s) return "";
    if (s === "READING_WRITING") return "Reading & Writing";
    if (s === "MATH") return "Math";
    return s;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8 lg:py-12">
      <div className="hero-shell mb-10 p-8 md:p-10">
        <div className="relative z-10">
          <Badge variant="live" className="mb-3">
            Command center
          </Badge>
          <h1 className="ds-title-xl">Welcome back</h1>
          <p className="ds-body mt-3 max-w-xl text-slate-600 dark:text-slate-400">
            Exam date, target score, and your latest mock—prioritized so you always know what to do next.
          </p>
        </div>
      </div>

      {!hasToken ? (
        <div className="cr-surface rounded-2xl p-10 text-center transition-all duration-300">
          <p className="mb-2 text-lg font-bold text-slate-800 dark:text-slate-100">You’re browsing as a guest</p>
          <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
            Sign in to sync your exam date, targets, and mock history across devices.
          </p>
          <ClassroomButton variant="primary" size="md" onClick={() => router.push("/login")}>
            Sign in
          </ClassroomButton>
        </div>
      ) : loading ? (
        <DashboardSkeleton />
      ) : (
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="metric-tile p-6 lg:p-7 group">
            <div className="flex items-center gap-3 mb-4 text-slate-500 dark:text-slate-400">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">Exam date</span>
            </div>
            <p className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white mb-4">{formatDate(me?.sat_exam_date ?? null)}</p>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60">
              <Link href="/profile" className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1 group/link">
                Set in Profile <span className="transition-transform group-hover/link:translate-x-1 inline-block">→</span>
              </Link>
            </div>
          </div>

          <div className="metric-tile p-6 lg:p-7 group">
            <div className="flex items-center gap-3 mb-4 text-slate-500 dark:text-slate-400">
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Target className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">Target score</span>
            </div>
            <p className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white mb-4">
              {me?.target_score != null ? me.target_score : "—"}
            </p>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold tracking-wide">Valid range: 400–1600</p>
            </div>
          </div>

          <div className="metric-tile p-6 lg:p-7 group sm:col-span-1">
            <div className="flex items-center gap-3 mb-4 text-slate-500 dark:text-slate-400">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-500/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Trophy className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">Last result</span>
            </div>
            {me?.last_mock_result ? (
              <>
                <p className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white">
                  {me.last_mock_result.score != null ? me.last_mock_result.score : "—"}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 font-semibold line-clamp-1">
                  {me.last_mock_result.mock_exam_title || "Mock exam"}
                </p>
                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/60">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold tracking-wide">
                    {subjectLabel(me.last_mock_result.practice_test_subject)}
                    {me.last_mock_result.completed_at
                      ? ` · ${formatDate(me.last_mock_result.completed_at)}`
                      : ""}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold mt-4">No completed mock exam yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
