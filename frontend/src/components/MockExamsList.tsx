"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { examsApi } from "@/lib/api";
import { ChevronRight, Search, X } from "lucide-react";
import Cookies from "js-cookie";

type ExamKindFilter = "ALL" | "MOCK_SAT" | "MIDTERM";

type MockExamsListProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  mockQuerySuffix?: string;
  examKindFilter?: ExamKindFilter;
};

export default function MockExamsList({
  eyebrow = "Student portal",
  title,
  description,
  mockQuerySuffix = "",
  examKindFilter = "ALL",
}: MockExamsListProps) {
  const [mockExams, setMockExams] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = Cookies.get("access_token");
    setIsLoggedIn(!!token);

    const fetchData = async () => {
      try {
        const mockExamsData = await examsApi.getMockExams();
        setMockExams(mockExamsData);
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

  const getAvailableDates = () => {
    const dates = new Set<string>();
    mockExams.forEach((exam: any) => {
      if (exam.practice_date) {
        const monthYear = exam.practice_date.substring(0, 7);
        dates.add(monthYear);
      }
    });
    return Array.from(dates).sort().reverse();
  };

  const formatDateLabel = (yearMonth: string) => {
    const [year, month] = yearMonth.split("-");
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const groupedExams = useMemo(() => {
    if (examKindFilter === "ALL") return mockExams;
    return (mockExams || []).filter((g: any) => {
      if (examKindFilter === "MOCK_SAT") return g.kind !== "MIDTERM";
      if (examKindFilter === "MIDTERM") return g.kind === "MIDTERM";
      return true;
    });
  }, [mockExams, examKindFilter]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const rows = groupedExams
    .filter(
      (group: any) =>
        group.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (group.practice_date && group.practice_date.includes(searchQuery))
    )
    .filter(
      (group: any) => !dateFilter || (group.practice_date && group.practice_date.startsWith(dateFilter))
    );

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-1 w-12 bg-slate-700 rounded-full" />
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest block">{eyebrow}</span>
        </div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2">{title}</h2>
        {description ? <p className="text-slate-500 font-medium leading-relaxed">{description}</p> : null}
        <p className="text-sm text-slate-400 mt-3">
          Mock exams use the <strong className="text-slate-600">MockExam</strong> flow only (break, no pause). They are not
          mixed with sectional practice tests.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-300 appearance-none cursor-pointer shadow-sm"
          >
            <option value="">All dates</option>
            {getAvailableDates().map((dateStr) => (
              <option key={dateStr} value={dateStr}>
                {formatDateLabel(dateStr)}
              </option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search mocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-300 shadow-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden divide-y divide-slate-100">
        {rows.map((group: any) => {
          const tests = group.tests || [];
          const completedCount = tests.filter((t: any) => {
            const att = attempts.find((a) => a.practice_test === t.id);
            return att?.is_completed;
          }).length;
          const totalTests = tests.length;
          const percentDone = totalTests > 0 ? Math.round((completedCount / totalTests) * 100) : 0;

          return (
            <div
              key={group.id}
              className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    {group.kind === "MIDTERM" ? "Midterm" : "Mock exam"}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(group.practice_date)}</span>
                </div>
                <h3 className="text-lg font-black text-slate-900 truncate">{group.title}</h3>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 max-w-[180px] h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-700 rounded-full transition-all" style={{ width: `${percentDone}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 tabular-nums">{percentDone}%</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isLoggedIn) {
                    router.push("/login");
                    return;
                  }
                  router.push(`/mock/${group.id}${mockQuerySuffix}`);
                }}
                className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-800 active:scale-[0.98] transition-all"
              >
                Open
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {groupedExams.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm font-medium">No mock exams available.</div>
        )}
        {groupedExams.length > 0 && rows.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm font-medium">No matches for your filters.</div>
        )}
      </div>
    </div>
  );
}
