"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { classesApi } from "@/lib/api";
import { Plus, Users, ArrowRight, KeyRound, RefreshCcw } from "lucide-react";

export default function ClassesPage() {
  const router = useRouter();
  const isAdmin = typeof window !== "undefined" && Cookies.get("is_admin") === "true";

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [newClass, setNewClass] = useState({ name: "", section: "", description: "" });

  const fetchClasses = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await classesApi.list();
      setClasses(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not load classes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = async () => {
    setError(null);
    try {
      const res = await classesApi.join(joinCode.trim());
      const c = res?.classroom;
      if (c?.id) router.push(`/classes/${c.id}`);
      else await fetchClasses();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not join class.");
    }
  };

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      const c = await classesApi.create({
        name: newClass.name.trim(),
        section: newClass.section.trim(),
        description: newClass.description.trim(),
      });
      setNewClass({ name: "", section: "", description: "" });
      await fetchClasses();
      if (c?.id) router.push(`/classes/${c.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not create class.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-12">
      <div className="flex items-start justify-between gap-6 mb-10">
        <div>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Classes</p>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Your classes</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Join with a class code. Inside each class you’ll find announcements, assignments, submissions, and grades.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchClasses}
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm hover:bg-slate-50"
        >
          <RefreshCcw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {loading ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 flex justify-center">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : classes.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10">
              <p className="text-slate-700 font-bold">No classes yet.</p>
              <p className="text-slate-500 mt-1 text-sm">Use a class code to join, or ask an admin to create one for you.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(`/classes/${c.id}`)}
                  className="text-left bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-lg font-extrabold text-slate-900 truncate">{c.name}</p>
                      <p className="text-sm text-slate-500 truncate">{c.section || "—"}</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-100">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-widest">
                    <span>{(c.members_count ?? 0)} members</span>
                    <span className="inline-flex items-center gap-1 text-blue-700">
                      Open <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-4 h-4 text-slate-500" />
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Join a class</p>
            </div>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Class code"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={!joinCode.trim()}
              className="w-full mt-3 py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-60"
            >
              Join
            </button>
          </div>

          {isAdmin && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Plus className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Create class (admin)</p>
              </div>
              <div className="space-y-3">
                <input
                  value={newClass.name}
                  onChange={(e) => setNewClass((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Class name"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                />
                <input
                  value={newClass.section}
                  onChange={(e) => setNewClass((p) => ({ ...p, section: e.target.value }))}
                  placeholder="Section (optional)"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                />
                <textarea
                  value={newClass.description}
                  onChange={(e) => setNewClass((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Description (optional)"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium min-h-[90px]"
                />
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newClass.name.trim() || creating}
                className="w-full mt-3 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <p className="text-[11px] text-slate-400 mt-3">
                Students can join using the class code generated automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
