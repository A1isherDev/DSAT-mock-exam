"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { examsApi } from "@/lib/api";
import { BookOpenCheck, Search, X, ArrowRight } from "lucide-react";
import Cookies from "js-cookie";

type PracticeTestsListProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

function subjectLabel(subject: string) {
  if (subject === "MATH") return "Mathematics";
  return "Reading & Writing";
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
      const blob = `${subjectLabel(t.subject)} ${t.label || ""} ${t.form_type || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [tests, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="mb-12">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-1 w-12 bg-emerald-600 rounded-full" />
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block">{eyebrow}</span>
        </div>
        <h2 className="text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-4">{title}</h2>
        {description ? (
          <p className="text-slate-500 dark:text-slate-400 font-medium max-w-2xl leading-relaxed text-lg">{description}</p>
        ) : null}
      </div>

      <div className="relative w-full max-w-md mb-10 group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
        <input
          type="text"
          placeholder="Search by subject or label..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-10 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[18px] text-sm font-medium focus:outline-none focus:ring-4 focus:ring-emerald-100 dark:focus:ring-emerald-900/40 transition-all shadow-sm"
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
          const completed = !!att?.is_completed;
          const modules = t.modules || [];
          const totalMin = modules.reduce((acc: number, m: any) => acc + (m.time_limit_minutes || 0), 0);

          return (
            <div
              key={t.id}
              className="group bg-white dark:bg-slate-900 rounded-[32px] shadow-sm overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-1 transition-all duration-500"
            >
              <div className="p-8 pb-4 relative">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Practice test</span>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-500 shadow-sm">
                    <BookOpenCheck className="w-6 h-6" />
                  </div>
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-2 tracking-tight">
                  {subjectLabel(t.subject)}
                  {t.label ? (
                    <span className="block text-sm font-bold text-slate-500 dark:text-slate-400 mt-1">Label: {t.label}</span>
                  ) : null}
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t.form_type === "US" ? "US Form" : "International"} · {modules.length} modules · {totalMin} min total
                </p>
                {completed && (
                  <p className="mt-3 text-[10px] font-black text-emerald-600 uppercase tracking-widest">Completed</p>
                )}
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
                  className="group/btn w-full flex items-center justify-center gap-3 font-black py-4 px-6 rounded-2xl transition-all text-sm uppercase tracking-widest bg-slate-900 dark:bg-slate-800 text-white hover:bg-emerald-600 shadow-xl shadow-slate-200 dark:shadow-none hover:shadow-emerald-200 active:scale-[0.98]"
                >
                  Open
                  <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full py-32 text-center rounded-[40px] border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50">
            <BookOpenCheck className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-bold text-sm uppercase tracking-widest">
              No practice tests assigned yet
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-2 max-w-md mx-auto">
              Mock exam sections are only under Mock Exam. Here you will see standalone practice tests once your teacher assigns them.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
