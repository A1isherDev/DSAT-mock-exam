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
  const [newClass, setNewClass] = useState({
    name: "",
    subject: "ENGLISH",
    lesson_days: "ODD",
    lesson_time: "",
    lesson_hours: "2",
    start_date: "",
    room_number: "",
    telegram_chat_url: "",
    max_students: "",
  });

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
        subject: newClass.subject as any,
        lesson_days: newClass.lesson_days as any,
        lesson_time: newClass.lesson_time.trim(),
        lesson_hours: newClass.lesson_hours ? Number(newClass.lesson_hours) : 2,
        start_date: newClass.start_date || undefined,
        room_number: newClass.room_number.trim(),
        telegram_chat_url: newClass.telegram_chat_url.trim(),
        max_students: newClass.max_students ? Number(newClass.max_students) : undefined,
      });
      setNewClass({
        name: "",
        subject: "ENGLISH",
        lesson_days: "ODD",
        lesson_time: "",
        lesson_hours: "2",
        start_date: "",
        room_number: "",
        telegram_chat_url: "",
        max_students: "",
      });
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
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Groups</p>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Your groups</h1>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Join with a group code. Inside each group you’ll find announcements, homework, submissions, and grades.
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
              <p className="text-slate-700 font-bold">No groups yet.</p>
              <p className="text-slate-500 mt-1 text-sm">Use a group code to join, or ask a teacher to create one for you.</p>
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
                      <p className="text-sm text-slate-500 truncate">
                        {(c.subject ? `${c.subject}` : "—")}
                        {c.lesson_days ? ` · ${c.lesson_days}` : ""}
                        {c.lesson_time ? ` · ${c.lesson_time}` : ""}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-100">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-widest">
                    <span>
                      {(c.members_count ?? 0)} students{c.max_students ? ` / ${c.max_students}` : ""}
                    </span>
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
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Join a group</p>
            </div>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Group code"
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
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Create group (teacher)</p>
              </div>
              <div className="space-y-3">
                <input
                  value={newClass.name}
                  onChange={(e) => setNewClass((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Group name"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newClass.subject}
                    onChange={(e) => setNewClass((p) => ({ ...p, subject: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white"
                  >
                    <option value="ENGLISH">English</option>
                    <option value="MATH">Math</option>
                  </select>
                  <select
                    value={newClass.lesson_days}
                    onChange={(e) => setNewClass((p) => ({ ...p, lesson_days: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold bg-white"
                  >
                    <option value="ODD">Odd days</option>
                    <option value="EVEN">Even days</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={newClass.lesson_time}
                    onChange={(e) => setNewClass((p) => ({ ...p, lesson_time: e.target.value }))}
                    placeholder="Lesson time (e.g. 18:00)"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                  />
                  <input
                    value={newClass.lesson_hours}
                    onChange={(e) => setNewClass((p) => ({ ...p, lesson_hours: e.target.value }))}
                    placeholder="Lesson hours (e.g. 2)"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={newClass.start_date}
                    onChange={(e) => setNewClass((p) => ({ ...p, start_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                  />
                  <input
                    value={newClass.room_number}
                    onChange={(e) => setNewClass((p) => ({ ...p, room_number: e.target.value }))}
                    placeholder="Room number (optional)"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                  />
                </div>
                <input
                  value={newClass.telegram_chat_url}
                  onChange={(e) => setNewClass((p) => ({ ...p, telegram_chat_url: e.target.value }))}
                  placeholder="Telegram chat link (optional)"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                />
                <input
                  value={newClass.max_students}
                  onChange={(e) => setNewClass((p) => ({ ...p, max_students: e.target.value }))}
                  placeholder="Number of students (optional)"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
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
                Students can join using the group code generated automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
