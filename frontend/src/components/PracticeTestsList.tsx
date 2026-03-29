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

type CardPack = { kind: "pack"; mockKey: number; mock: any; tests: any[] };
type CardSingle = { kind: "single"; test: any };

function buildCards(tests: any[]): (CardPack | CardSingle)[] {
  const standalone: any[] = [];
  const byMock = new Map<number, any[]>();
  for (const t of tests) {
    const m = t.mock_exam;
    if (!m?.id) {
      standalone.push(t);
      continue;
    }
    if (!byMock.has(m.id)) byMock.set(m.id, []);
    byMock.get(m.id)!.push(t);
  }
  const packs: CardPack[] = Array.from(byMock.entries()).map(([mockKey, list]) => ({
    kind: "pack",
    mockKey,
    mock: list[0].mock_exam,
    tests: list,
  }));
  packs.sort((a, b) => {
    const da = a.mock.practice_date || "";
    const db = b.mock.practice_date || "";
    return db.localeCompare(da);
  });
  const singles: CardSingle[] = standalone.map((test) => ({ kind: "single", test }));
  return [...packs, ...singles];
}

function formatLineDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function firstSectionTestId(tests: any[]) {
  const rw = tests.find((t) => t.subject === "READING_WRITING");
  const math = tests.find((t) => t.subject === "MATH");
  return (rw || math || tests[0])?.id;
}

function subjectLabel(subject: string) {
  if (subject === "MATH") return "Mathematics";
  return "Reading & Writing";
}

function singleDisplayTitle(test: any) {
  if (test.title && String(test.title).trim()) return String(test.title).trim();
  const form = test.form_type === "US" ? "US Form" : "International Form";
  const letter = test.label ? ` ${test.label}` : "";
  return `${form}${letter} · ${subjectLabel(test.subject)}`.trim();
}

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

  const cards = useMemo(() => buildCards(tests), [tests]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cards;
    return cards.filter((c) => {
      if (c.kind === "pack") {
        const blob = `${c.mock.title || ""} ${formatLineDate(c.mock.practice_date)} ${c.tests.map((t) => subjectLabel(t.subject)).join(" ")}`.toLowerCase();
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
          if (c.kind === "pack") {
            const pct = progressPack(c.tests, attempts);
            const openId = firstSectionTestId(c.tests);
            return (
              <div
                key={`pack-${c.mockKey}`}
                className="group bg-white dark:bg-slate-900 rounded-[32px] shadow-sm overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 hover:shadow-2xl hover:shadow-violet-500/10 hover:-translate-y-1 transition-all duration-500"
              >
                <div className="p-8 pb-4 relative">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">
                        Pastpaper practice
                      </span>
                      <span className="text-xs font-bold text-slate-400">{formatLineDate(c.mock.practice_date)}</span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
                      <FileText className="w-6 h-6" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-serif font-bold text-slate-900 dark:text-slate-100 mb-3 tracking-tight group-hover:text-indigo-600 transition-colors">
                    {c.mock.title}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">
                    {c.tests.length} sectional test{c.tests.length !== 1 ? "s" : ""} (open R&amp;W first for form flow)
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{pct}%</span>
                  </div>
                </div>
                <div className="p-6 pt-0 mt-auto">
                  <button
                    type="button"
                    disabled={!openId}
                    onClick={() => {
                      if (!isLoggedIn) {
                        router.push("/login");
                        return;
                      }
                      if (openId) router.push(`/practice-test/${openId}`);
                    }}
                    className="group/btn w-full flex items-center justify-center gap-3 font-black py-4 px-6 rounded-2xl transition-all text-sm uppercase tracking-widest bg-slate-900 dark:bg-slate-800 text-white hover:bg-indigo-600 shadow-xl shadow-slate-200 dark:shadow-none disabled:opacity-50"
                  >
                    Enter practice test
                    <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            );
          }

          const t = c.test;
          const pct = progressSingle(t, attempts);
          const modules = [...(t.modules || [])].sort(
            (a: any, b: any) => (a.module_order ?? 0) - (b.module_order ?? 0)
          );
          const totalMin = modules.reduce((acc: number, m: any) => acc + (m.time_limit_minutes || 0), 0);
          const att = attempts
            .filter((a) => a.practice_test === t.id)
            .sort((a, b) => (b.id || 0) - (a.id || 0))[0];
          const completed = !!att?.is_completed;

          return (
            <div
              key={`single-${t.id}`}
              className="group bg-white dark:bg-slate-900 rounded-[32px] shadow-sm overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 hover:shadow-2xl hover:shadow-violet-500/10 hover:-translate-y-1 transition-all duration-500"
            >
              <div className="p-8 pb-4 relative">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">
                      Pastpaper practice
                    </span>
                    <span className="text-xs font-bold text-slate-400">{formatLineDate(t.practice_date || t.created_at)}</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
                    <FileText className="w-6 h-6" />
                  </div>
                </div>
                <h3 className="text-2xl font-serif font-bold text-slate-900 dark:text-slate-100 mb-3 tracking-tight">
                  {singleDisplayTitle(t)}
                </h3>
                <p className="text-[10px] font-black text-emerald-700/80 dark:text-emerald-500/90 uppercase tracking-widest mb-2">
                  Pastpaper
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">
                  {t.form_type === "US" ? "US Form" : "International"} · {modules.length} modules · {totalMin} min
                </p>
                <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 px-4 py-3 mb-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Modules</p>
                  {modules.length === 0 ? (
                    <p className="text-xs text-slate-400">No modules yet</p>
                  ) : (
                    <ul className="space-y-2">
                      {modules.map((m: any) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between text-sm font-bold text-slate-700 dark:text-slate-200"
                        >
                          <span>Module {m.module_order}</span>
                          <span className="text-xs font-black text-slate-400 tabular-nums">{m.time_limit_minutes ?? 0} min</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{pct}%</span>
                </div>
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
                  className="group/btn w-full flex items-center justify-center gap-3 font-black py-4 px-6 rounded-2xl transition-all text-sm uppercase tracking-widest bg-slate-900 dark:bg-slate-800 text-white hover:bg-indigo-600 shadow-xl"
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
