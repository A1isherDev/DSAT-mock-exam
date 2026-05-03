"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { teacherApi } from "@/features/teacher/api";
import { ClipboardList, Users } from "lucide-react";

export default function TeacherDashboardPage() {
  const classesApi = teacherApi.classes;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await classesApi.list();
        const teacherGroups = all.items.filter((g) => g.my_role === "ADMIN");
        if (cancelled) return;
        setGroups(teacherGroups);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || "Could not load teacher dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-8 py-12">
      <div className="mb-8 hero-shell p-8">
        <p className="eyebrow mb-2">Dashboard</p>
        <h1 className="title-xl">Teacher command desk</h1>
        <p className="text-slate-600 mt-2">Group overview and quick access to lessons.</p>
      </div>

      {error && <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm">{error}</div>}

      {loading ? (
        <div className="panel p-10 flex justify-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="metric-tile p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-slate-500" />
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Groups overview</p>
              </div>
              {groups.length === 0 ? (
                <p className="text-slate-600">No groups yet. Create a group from the Groups page.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {groups.map((g) => (
                    <Link key={g.id} href={`/classes/${g.id}`} className="block p-4 rounded-2xl border border-slate-200 hover:shadow-md bg-slate-50/80 hover:-translate-y-0.5 transition-all">
                      <p className="font-extrabold text-slate-900">{g.name}</p>
                      <p className="text-sm text-slate-500 mt-1">
                        {g.subject || "—"}{g.lesson_schedule ? ` · ${g.lesson_schedule}` : ""}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-2 font-bold uppercase tracking-widest">
                        {g.members_count ?? 0} students{g.max_students ? ` / ${g.max_students}` : ""}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="metric-tile p-6">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="w-4 h-4 text-slate-500" />
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Quick access</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/teacher/homework" className="btn-primary">
                  Manage homework
                </Link>
                <Link href="/classes/grade-homework" className="btn-secondary">
                  Grade homework
                </Link>
                <Link href="/teacher/students" className="btn-secondary">View students</Link>
                <Link href="/assessments/assign" className="btn-secondary">
                  Assign assessments
                </Link>
              </div>
              <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                With staff access, use Exams admin: <strong>Pastpaper tests</strong> for released-form practice, and{" "}
                <strong>Mock exams</strong> for separate timed diagnostics (questions you build for that mock—not the practice bank).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

