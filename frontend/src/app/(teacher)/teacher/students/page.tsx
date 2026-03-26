"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import { Users } from "lucide-react";

export default function TeacherStudentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [people, setPeople] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await classesApi.list();
        const teacherGroups = (Array.isArray(all) ? all : []).filter((g) => g.my_role === "ADMIN");
        if (cancelled) return;
        setGroups(teacherGroups);
        const gid = teacherGroups[0]?.id;
        if (gid) setSelectedGroupId(gid);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || "Could not load groups.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedGroupId) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const pe = await classesApi.people(selectedGroupId);
        if (!cancelled) setPeople(Array.isArray(pe) ? pe : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || "Could not load students.");
      }
    })();
    return () => { cancelled = true; };
  }, [selectedGroupId]);

  return (
    <div className="max-w-6xl mx-auto px-8 py-12">
      <div className="mb-8">
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Students</p>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Students</h1>
        <p className="text-slate-500 mt-2">View students in your groups.</p>
      </div>

      {error && <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm">{error}</div>}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 flex justify-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <p className="font-bold text-slate-900">Group</p>
            </div>
            <select
              value={selectedGroupId ?? ""}
              onChange={(e) => setSelectedGroupId(Number(e.target.value))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold bg-white"
            >
              <option value="">Select group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} {g.subject ? `(${g.subject})` : ""}
                </option>
              ))}
            </select>
            {selectedGroupId ? (
              <Link href={`/classes/${selectedGroupId}`} className="text-sm font-bold text-blue-700 hover:underline">
                Open group
              </Link>
            ) : null}
          </div>

          {people.length === 0 ? (
            <div className="p-6 text-slate-600">No students yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {people
                .filter((m) => m.role === "STUDENT")
                .map((m) => (
                  <div key={m.id} className="p-5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">
                        {m.user?.first_name || m.user?.email} {m.user?.last_name || ""}
                      </p>
                      <p className="text-sm text-slate-500 truncate">{m.user?.email}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                      STUDENT
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

