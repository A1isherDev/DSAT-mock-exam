"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { examsApi } from "@/lib/api";
import { FileText, Search, X, ArrowRight } from "lucide-react";
import Cookies from "js-cookie";

type ExamKindFilter = "ALL" | "MOCK_SAT" | "MIDTERM";

type MockExamsListProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  mockQuerySuffix?: string;
  examKindFilter?: ExamKindFilter;
};

/** Student API returns portal rows (mock_exam_id, section_test_ids). Staff may get full MockExam with tests. */
function routeMockId(group: any) {
  return group.mock_exam_id ?? group.id;
}

function sectionTestIds(group: any): number[] {
  if (Array.isArray(group.section_test_ids)) return group.section_test_ids;
  const tests = group.tests || [];
  return tests.map((t: any) => t.id).filter(Boolean);
}

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
    if (!dateStr) return "No Date";
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

  const progressForGroup = (group: any) => {
    const ids = sectionTestIds(group);
    if (ids.length === 0) return 0;
    const done = ids.filter((tid) =>
      attempts.some((a) => a.practice_test === tid && a.is_completed)
    ).length;
    return Math.round((done / ids.length) * 100);
  };

  const filtered = groupedExams
    .filter(
      (group: any) =>
        (group.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (group.practice_date && group.practice_date.includes(searchQuery))
    )
    .filter(
      (group: any) => !dateFilter || (group.practice_date && group.practice_date.startsWith(dateFilter))
    );

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="mb-12">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-1 w-12 bg-indigo-600 rounded-full" />
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block">{eyebrow}</span>
        </div>
        <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-4">{title}</h2>
        {description ? (
          <p className="text-slate-500 font-medium max-w-2xl leading-relaxed text-lg">{description}</p>
        ) : null}
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
        <div className="w-full md:w-auto relative group flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-[18px] text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-100 appearance-none cursor-pointer shadow-sm"
            >
              <option value="">All Available Dates</option>
              {getAvailableDates().map((dateStr) => (
                <option key={dateStr} value={dateStr}>
                  {formatDateLabel(dateStr)}
                </option>
              ))}
            </select>
          </div>
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter("")}
              className="p-3 text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-[14px] shadow-sm"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600" />
          <input
            type="text"
            placeholder="Search mock exams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-[18px] text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-100 shadow-sm"
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filtered.map((group: any) => {
          const pct = progressForGroup(group);
          const mid = routeMockId(group);
          return (
            <div
              key={group.id ?? mid}
              className="group bg-white rounded-[32px] shadow-sm overflow-hidden flex flex-col border border-slate-200 hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-500"
            >
              <div className="p-8 pb-4 relative">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">
                      {group.kind === "MIDTERM" ? "Midterm" : "Timed SAT mock"}
                    </span>
                    <span className="text-xs font-bold text-slate-400">{formatDate(group.practice_date)}</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
                    <FileText className="w-6 h-6" />
                  </div>
                </div>
                <h3 className="text-2xl font-serif font-bold text-slate-900 mb-3 tracking-tight group-hover:text-indigo-700 transition-colors">
                  {group.title}
                </h3>
                <div className="flex items-center gap-2 mb-6">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${pct}%` }} />
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
                    router.push(`/mock/${mid}${mockQuerySuffix}`);
                  }}
                  className="group/btn w-full flex items-center justify-center gap-3 font-black py-4 px-6 rounded-2xl transition-all text-sm uppercase tracking-widest bg-slate-900 text-white hover:bg-indigo-600 shadow-xl shadow-slate-200 hover:shadow-indigo-200 active:scale-[0.98]"
                >
                  Enter timed mock
                  <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}

        {groupedExams.length === 0 && (
          <div className="col-span-full py-24 text-center rounded-[40px] border-2 border-dashed border-slate-200 bg-white/60 max-w-2xl mx-auto px-8">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-600 font-bold text-sm uppercase tracking-widest">No mock exams here yet</p>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed">
              Nothing is listed until an admin publishes a <strong>timed mock</strong> and assigns you on the portal. These
              exams are authored for assessment only—not linked to pastpaper practice tests. Practice real released forms
              under <strong>Pastpaper tests</strong> first.
            </p>
          </div>
        )}
        {groupedExams.length > 0 && filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400 text-sm font-medium">No matches for your filters.</div>
        )}
      </div>
    </div>
  );
}
