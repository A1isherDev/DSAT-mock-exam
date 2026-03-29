"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { examsApi } from "@/lib/api";
import { FileText, Search, X, ArrowRight } from "lucide-react";
import Cookies from "js-cookie";

type PracticeTestsListProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

function formatCardDate(iso: string | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function buildPracticeCardTitle(t: { subject: string; label?: string; form_type?: string }) {
  const form = t.form_type === "US" ? "US Form" : "International Form";
  const letter = t.label ? ` ${t.label}` : "";
  const subj = t.subject === "MATH" ? "Math" : "English";
  return `${form}${letter} · ${subj}`.trim();
}

function progressPercent(t: { modules?: { id?: number }[] }, att: any) {
  if (!att) return 0;
  if (att.is_completed) return 100;
  const total = (t.modules || []).length;
  if (!total) return 0;
  const done = Array.isArray(att.completed_modules) ? att.completed_modules.length : 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export default function PracticeTestsList({
  eyebrow = "Student portal",
  title,
  description,
}: PracticeTestsListProps) {
  const [tests, setTests] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = Cookies.get("access_token");
    setIsLoggedIn(!!token);

    const fetchData = async () => {
      try {
        const list = await examsApi.getPracticeTests();
        setTests(Array.isArray(list) ? list : []);
        if (token) {
          const attemptsData = await examsApi.getAttempts();
          setAttempts(attemptsData);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return tests;
    return tests.filter((t: any) => {
      const mockTitle = t.mock_exam?.title || "";
      const blob =
        `${buildPracticeCardTitle(t)} ${t.form_type || ""} ${formatCardDate(t.created_at)} ${mockTitle}`.toLowerCase();
      return blob.includes(q);
    });
  }, [tests, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="mb-12">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-1 w-12 bg-indigo-600 rounded-full" />
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block">{eyebrow}</span>
        </div>
        <h2 className="text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-4">{title}</h2>
        {description ? (
          <p className="text-slate-500 dark:text-slate-400 font-medium max-w-2xl leading-relaxed text-lg">{description}</p>
        ) : null}
      </div>

      <div className="relative w-full max-w-md mb-10 group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
        <input
          type="text"
          placeholder="Search by form, subject, or date..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-10 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[18px] text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 transition-all shadow-sm"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filtered.map((t: any) => {
          const att = attempts
            .filter((a) => a.practice_test === t.id)
            .sort((a, b) => (b.id || 0) - (a.id || 0))[0];
          const pct = progressPercent(t, att);
          const modules = t.modules || [];
          const totalMin = modules.reduce((acc: number, m: any) => acc + (m.time_limit_minutes || 0), 0);

          return (
            <div
              key={t.id}
              className="group bg-white dark:bg-slate-900 rounded-[32px] shadow-sm overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-500"
            >
              <div className="p-8 pb-4 relative">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Practice test</span>
                    <span className="text-xs font-bold text-slate-400">{formatCardDate(t.created_at)}</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
                    <FileText className="w-6 h-6" />
                  </div>
                </div>

                <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-3 tracking-tight group-hover:text-indigo-600 transition-colors">
                  {buildPracticeCardTitle(t)}
                </h3>
                {t.mock_exam?.title ? (
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                    From mock pack: {t.mock_exam.title}
                  </p>
                ) : (
                  <p className="text-[10px] font-black text-indigo-700/70 dark:text-indigo-400/80 uppercase tracking-widest mb-2">
                    Standalone practice
                  </p>
                )}

                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">
                  {modules.length} modules · {totalMin} min total
                </p>

                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-1000 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{pct}%</span>
                </div>
              </div>

              <div className="p-6 pt-0 mt-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (!isLoggedIn) {
                      router.push("/login");
                      return;
                    }
                    router.push(`/practice-test/${t.id}`);
                  }}
                  className="group/btn w-full flex items-center justify-center gap-3 font-black py-4 px-6 rounded-2xl transition-all text-sm uppercase tracking-widest bg-slate-900 dark:bg-slate-800 text-white hover:bg-indigo-600 shadow-xl shadow-slate-200 dark:shadow-none hover:shadow-indigo-200 active:scale-[0.98]"
                >
                  Open practice test
                  <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full py-32 text-center rounded-[40px] border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50">
            <FileText className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-bold text-sm uppercase tracking-widest">
              No practice tests assigned yet
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-2 max-w-md mx-auto">
              Includes standalone drills and each English/Math section from assigned mock packs. The continuous full mock
              (break, no pause) appears under <strong>Mock Exam</strong> only when an admin assigns that mock to you there.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
