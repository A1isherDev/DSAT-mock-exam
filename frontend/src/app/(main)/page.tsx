"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import { usersApi } from "@/lib/api";
import { Calendar, Target, Trophy } from "lucide-react";

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
      return new Date(d).toLocaleDateString("uz-UZ", {
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
    <div className="max-w-5xl mx-auto px-8 py-12">
      <div className="mb-10">
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Dashboard</p>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Xush kelibsiz</h1>
        <p className="text-slate-500 mt-2 max-w-xl">
          Imtihon sanasi, maqsadli ball va oxirgi mock natijangizni shu yerdan kuzatishingiz mumkin.
        </p>
      </div>

      {!hasToken ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-slate-600 font-medium mb-4">Shaxsiy ma&apos;lumotlarni ko&apos;rish uchun tizimga kiring.</p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 text-white font-bold px-6 py-3 text-sm hover:bg-blue-700 transition-colors"
          >
            Kirish
          </Link>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3 text-slate-500">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span className="text-xs font-bold uppercase tracking-wider">Exam date</span>
            </div>
            <p className="text-2xl font-black text-slate-900">{formatDate(me?.sat_exam_date ?? null)}</p>
            <p className="text-xs text-slate-400 mt-2">
              <Link href="/profile" className="text-blue-600 font-semibold hover:underline">
                Profilda
              </Link>{" "}
              o&apos;rnatiladi
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3 text-slate-500">
              <Target className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-bold uppercase tracking-wider">Target score</span>
            </div>
            <p className="text-2xl font-black text-slate-900">
              {me?.target_score != null ? me.target_score : "—"}
            </p>
            <p className="text-xs text-slate-400 mt-2">400–1600 oralig&apos;ida</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:col-span-1">
            <div className="flex items-center gap-3 mb-3 text-slate-500">
              <Trophy className="w-5 h-5 text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider">Last result (Mock)</span>
            </div>
            {me?.last_mock_result ? (
              <>
                <p className="text-2xl font-black text-slate-900">
                  {me.last_mock_result.score != null ? me.last_mock_result.score : "—"}
                </p>
                <p className="text-sm text-slate-600 mt-1 font-medium line-clamp-2">
                  {me.last_mock_result.mock_exam_title || "Mock exam"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {subjectLabel(me.last_mock_result.practice_test_subject)}
                  {me.last_mock_result.completed_at
                    ? ` · ${formatDate(me.last_mock_result.completed_at)}`
                    : ""}
                </p>
              </>
            ) : (
              <p className="text-slate-500 text-sm font-medium">Hali yakunlangan mock yo&apos;q</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
