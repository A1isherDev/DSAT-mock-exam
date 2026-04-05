"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { examsApi } from "@/lib/api";
import {
  buildHomeworkPastpaperCards,
  formatLineDate,
  isTimedMockSectionRow,
  sharedPastpaperPackTitle,
  singleDisplayTitle,
  sortPastpaperSections,
  subjectLabel,
} from "@/lib/practiceTestCards";
import { FileText, Search, X, ArrowRight } from "lucide-react";
import Cookies from "js-cookie";

type PracticeTestsListProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

function progressPack(tests: any[], attempts: any[]) {
  if (!tests.length) return 0;
  const done = tests.filter((t) =>
    attempts.some((a) => a.practice_test === t.id && a.is_completed)
  ).length;
  return Math.round((done / tests.length) * 100);
}

function progressSingle(test: any, attempts: any[]) {
  const att = attempts
    .filter((a) => a.practice_test === test.id)
    .sort((a, b) => (b.id || 0) - (a.id || 0))[0];
  if (!att) return 0;
  if (att.is_completed) return 100;
  const modules = test.modules || [];
  const total = modules.length;
  if (!total) return 0;
  const done = Array.isArray(att.completed_modules) ? att.completed_modules.length : 0;
  return Math.min(100, Math.round((done / total) * 100));
}

function PackSectionFooter({
  tests,
  isLoggedIn,
  router,
  attempts,
}: {
  tests: any[];
  isLoggedIn: boolean;
  attempts: any[];
  router: ReturnType<typeof useRouter>;
}) {
  const sorted = sortPastpaperSections(tests);
  return (
    <div className="p-6 pt-2 mt-auto space-y-2">
      {sorted.map((t) => {
        const pct = progressSingle(t, attempts);
        const att = attempts
          .filter((a) => a.practice_test === t.id)
          .sort((a, b) => (b.id || 0) - (a.id || 0))[0];
        const completed = !!att?.is_completed;
        const isMath = t.subject === "MATH";
        return (
          <div
            key={t.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-2xl border border-slate-200/80 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/40 p-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-900 dark:text-slate-100">{subjectLabel(t.subject)}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {(t.modules?.length ?? 0)} modules · {pct}%{completed ? " · Done" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!isLoggedIn) {
                  router.push("/login");
                  return;
                }
                router.push(`/practice-test/${t.id}`);
              }}
              className={`shrink-0 flex items-center justify-center gap-2 font-black py-3 px-4 rounded-xl text-[10px] uppercase tracking-widest text-white ${
                isMath ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              Open
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
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
        const raw = Array.isArray(list) ? list : [];
        setTests(raw.filter((t) => !isTimedMockSectionRow(t)));
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

  const cards = useMemo(() => buildHomeworkPastpaperCards(tests), [tests]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cards;
    return cards.filter((c) => {
      if (c.kind === "pastpaper_pack") {
        const blob = `${sharedPastpaperPackTitle(c.tests)} ${formatLineDate(c.tests[0]?.practice_date)} ${c.tests.map((t) => subjectLabel(t.subject)).join(" ")}`.toLowerCase();
        return blob.includes(q);
      }
      const t = c.test;
      const blob = `${singleDisplayTitle(t)} ${t.label || ""} ${t.mock_exam?.title || ""} ${t.practice_date || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [cards, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="mb-12">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-1 w-12 bg-violet-600 rounded-full" />
          <span className="text-[10px] font-bold text-violet-600 uppercase tracking-widest block">{eyebrow}</span>
        </div>
        <h2 className="text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-4">{title}</h2>
        {description ? (
          <p className="text-slate-500 dark:text-slate-400 font-medium max-w-2xl leading-relaxed text-lg">{description}</p>
        ) : null}
      </div>

      <div className="relative w-full max-w-md mb-10 group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-violet-600 transition-colors" />
        <input
          type="text"
          placeholder="Search practice packs and tests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-10 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[18px] text-sm font-medium focus:outline-none focus:ring-4 focus:ring-violet-100 dark:focus:ring-violet-900/40 transition-all shadow-sm"
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
        {filtered.map((c) => {
          const cardShell =
            "group bg-white dark:bg-slate-900 rounded-[32px] overflow-hidden flex flex-col border border-slate-200/90 dark:border-slate-700 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.12)] dark:shadow-none hover:shadow-[0_16px_48px_-12px_rgba(91,33,182,0.18)] hover:-translate-y-1 transition-all duration-500";

          if (c.kind === "pastpaper_pack") {
            const pct = progressPack(c.tests, attempts);
            const lineDate = c.pack?.practice_date || c.tests[0]?.practice_date || c.tests[0]?.created_at;
            const heading = (c.pack?.title && String(c.pack.title).trim()) || sharedPastpaperPackTitle(c.tests);
            return (
              <div key={`pastpaper-pack-${c.packKey}`} className={cardShell}>
                <div className="p-8 pb-4 relative">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">
                        Practice test
                      </span>
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{formatLineDate(lineDate)}</span>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-950/80 flex items-center justify-center text-violet-700 dark:text-violet-300 shadow-sm border border-violet-200/60 dark:border-violet-800/50">
                      <FileText className="w-6 h-6" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-serif font-bold text-slate-900 dark:text-slate-100 mb-6 tracking-tight leading-snug group-hover:text-violet-800 dark:group-hover:text-violet-300 transition-colors">
                    {heading}
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[3px] bg-slate-200/90 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 transition-all duration-1000" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider tabular-nums min-w-[2.25rem] text-right">
                      {pct}%
                    </span>
                  </div>
                </div>
                <PackSectionFooter tests={c.tests} isLoggedIn={isLoggedIn} router={router} attempts={attempts} />
              </div>
            );
          }

          const t = c.test;
          const pct = progressSingle(t, attempts);
          const att = attempts
            .filter((a) => a.practice_test === t.id)
            .sort((a, b) => (b.id || 0) - (a.id || 0))[0];
          const completed = !!att?.is_completed;

          return (
            <div key={`single-${t.id}`} className={cardShell}>
              <div className="p-8 pb-4 relative">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">
                      Practice test
                    </span>
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                      {formatLineDate(t.practice_date || t.created_at)}
                    </span>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-950/80 flex items-center justify-center text-violet-700 dark:text-violet-300 shadow-sm border border-violet-200/60 dark:border-violet-800/50">
                    <FileText className="w-6 h-6" />
                  </div>
                </div>
                <h3 className="text-2xl font-serif font-bold text-slate-900 dark:text-slate-100 mb-6 tracking-tight leading-snug group-hover:text-violet-800 dark:group-hover:text-violet-300 transition-colors">
                  {singleDisplayTitle(t)}
                </h3>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-[3px] bg-slate-200/90 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 transition-all duration-1000" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider tabular-nums min-w-[2.25rem] text-right">
                    {pct}%
                  </span>
                </div>
                {completed && (
                  <p className="mt-4 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                    Completed
                  </p>
                )}
              </div>
              <div className="p-6 pt-2 mt-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (!isLoggedIn) {
                      router.push("/login");
                      return;
                    }
                    router.push(`/practice-test/${t.id}`);
                  }}
                  className="group/btn w-full flex items-center justify-center gap-3 font-black py-4 px-6 rounded-2xl transition-all text-sm uppercase tracking-widest bg-[#0f172a] dark:bg-slate-950 text-white hover:bg-violet-700 dark:hover:bg-violet-700 shadow-lg shadow-slate-900/10 active:scale-[0.98]"
                >
                  Enter practice test
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
          </div>
        )}
      </div>
    </div>
  );
}
