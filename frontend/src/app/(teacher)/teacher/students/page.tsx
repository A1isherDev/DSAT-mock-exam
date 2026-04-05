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
        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">Students</p>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Students</h1>
        <p className="text-muted-foreground mt-2">View students in your groups.</p>
      </div>

      {error && <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm">{error}</div>}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 flex justify-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="font-bold text-foreground">Group</p>
            </div>
            <select
              value={selectedGroupId ?? ""}
              onChange={(e) => setSelectedGroupId(Number(e.target.value))}
              className="ui-input rounded-xl px-3 py-2 text-sm font-semibold"
            >
              <option value="">Select group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} {g.subject ? `(${g.subject})` : ""}
                </option>
              ))}
            </select>
            {selectedGroupId ? (
              <Link href={`/classes/${selectedGroupId}`} className="text-sm font-bold text-primary hover:underline">
                Open group
              </Link>
            ) : null}
          </div>

          {people.length === 0 ? (
            <div className="p-6 text-muted-foreground">No students yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {people
                .filter((m) => m.role === "STUDENT")
                .map((m) => (
                  <div key={m.id} className="p-5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-foreground">
                        {m.user?.first_name || m.user?.email} {m.user?.last_name || ""}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{m.user?.email}</p>
                    </div>
                    <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
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

