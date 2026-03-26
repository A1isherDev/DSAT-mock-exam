"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import { Plus, Trash2, Pencil, Calendar } from "lucide-react";

export default function TeacherHomeworkPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);

  const [form, setForm] = useState({ title: "", instructions: "", due_at: "", external_url: "" });
  const [file, setFile] = useState<File | null>(null);

  const refreshGroups = async () => {
    const all = await classesApi.list();
    const teacherGroups = (Array.isArray(all) ? all : []).filter((g) => g.my_role === "ADMIN");
    setGroups(teacherGroups);
    if (!selectedGroupId && teacherGroups[0]?.id) setSelectedGroupId(teacherGroups[0].id);
  };

  const refreshAssignments = async (gid: number) => {
    const a = await classesApi.listAssignments(gid);
    setAssignments(Array.isArray(a) ? a : []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await refreshGroups();
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || "Could not load groups.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedGroupId) return;
    refreshAssignments(selectedGroupId);
  }, [selectedGroupId]);

  const handleCreate = async () => {
    if (!selectedGroupId) return;
    setError(null);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("instructions", form.instructions);
      if (form.due_at) fd.append("due_at", form.due_at);
      if (form.external_url) fd.append("external_url", form.external_url);
      if (file) fd.append("attachment_file", file);
      await classesApi.createAssignment(selectedGroupId, fd, true);
      setForm({ title: "", instructions: "", due_at: "", external_url: "" });
      setFile(null);
      await refreshAssignments(selectedGroupId);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not create homework.");
    }
  };

  const formatDue = (s?: string) => {
    if (!s) return "No deadline";
    try {
      return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return s;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-12">
      <div className="mb-8">
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Homework</p>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Homework management</h1>
        <p className="text-slate-500 mt-2">Create, edit, and track homework submissions.</p>
      </div>

      {error && <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm">{error}</div>}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 flex justify-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Group</p>
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
              </div>
              {selectedGroupId ? (
                <Link href={`/classes/${selectedGroupId}`} className="text-sm font-bold text-blue-700 hover:underline">
                  Open group
                </Link>
              ) : null}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 font-bold text-slate-900">Assignments</div>
              {assignments.length === 0 ? (
                <div className="p-6 text-slate-600">No homework. Create one on the right.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {assignments.map((a) => (
                    <div key={a.id} className="p-5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-extrabold text-slate-900 truncate">{a.title}</p>
                        <p className="text-sm text-slate-500 mt-1 inline-flex items-center gap-2">
                          <Calendar className="w-4 h-4" /> {formatDue(a.due_at)}
                        </p>
                      </div>
                      <Link
                        href={`/classes/${selectedGroupId}/assignments/${a.id}`}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm hover:bg-slate-50"
                      >
                        View submissions
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Create homework</p>
            <div className="space-y-3">
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Title"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
              />
              <textarea
                value={form.instructions}
                onChange={(e) => setForm((p) => ({ ...p, instructions: e.target.value }))}
                placeholder="Description"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm min-h-[110px]"
              />
              <input
                value={form.external_url}
                onChange={(e) => setForm((p) => ({ ...p, external_url: e.target.value }))}
                placeholder="Link (optional)"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
              />
              <input
                value={form.due_at}
                onChange={(e) => setForm((p) => ({ ...p, due_at: e.target.value }))}
                placeholder="Deadline (ISO) e.g. 2026-04-01T18:00:00Z"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
              />
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-sm" />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!selectedGroupId || !form.title.trim()}
              className="w-full mt-3 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60"
            >
              Create homework
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

