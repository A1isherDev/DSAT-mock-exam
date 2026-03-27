"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { classesApi, adminApi } from "@/lib/api";
import { Plus, Users, ArrowRight, KeyRound, RefreshCcw, X } from "lucide-react";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function ClassesPage() {
  const router = useRouter();
  const isAdmin = typeof window !== "undefined" && Cookies.get("is_admin") === "true";

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [newClass, setNewClass] = useState({
    name: "",
    subject: "ENGLISH",
    lesson_days: "ODD",
    lesson_time: "",
    lesson_hours: "2",
    start_date: "",
    room_number: "",
    telegram_chat_url: "",
    teacher: "",
    max_students: "",
  });
  const [editClass, setEditClass] = useState({
    name: "",
    subject: "ENGLISH",
    lesson_days: "ODD",
    lesson_time: "",
    lesson_hours: "2",
    start_date: "",
    room_number: "",
    telegram_chat_id: "",
    teacher: "",
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
    if (isAdmin) {
      adminApi.getUsers().then((u) => {
        const list = (Array.isArray(u) ? u : []).filter((x: any) => x.role === "ADMIN" || x.is_admin);
        setTeachers(list);
      }).catch(() => {});
    }
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
        telegram_chat_id: newClass.telegram_chat_url.trim(),
        teacher: newClass.teacher ? Number(newClass.teacher) : undefined,
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
        teacher: "",
        max_students: "",
      });
      setCreateOpen(false);
      await fetchClasses();
      if (c?.id) router.push(`/classes/${c.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not create class.");
    } finally {
      setCreating(false);
    }
  };

  const beginEdit = (c: any) => {
    setEditingId(c.id);
    setEditClass({
      name: c.name || "",
      subject: c.subject || "ENGLISH",
      lesson_days: c.lesson_days || "ODD",
      lesson_time: c.lesson_time || "",
      lesson_hours: c.lesson_hours != null ? String(c.lesson_hours) : "2",
      start_date: c.start_date || "",
      room_number: c.room_number || "",
      telegram_chat_id: c.telegram_chat_id || "",
      teacher: c.teacher ? String(c.teacher) : "",
      max_students: c.max_students != null ? String(c.max_students) : "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError(null);
    try {
      await classesApi.update(editingId, {
        name: editClass.name.trim(),
        subject: editClass.subject,
        lesson_days: editClass.lesson_days,
        lesson_time: editClass.lesson_time.trim(),
        lesson_hours: editClass.lesson_hours ? Number(editClass.lesson_hours) : 2,
        start_date: editClass.start_date || null,
        room_number: editClass.room_number.trim(),
        telegram_chat_id: editClass.telegram_chat_id.trim(),
        teacher: editClass.teacher ? Number(editClass.teacher) : null,
        max_students: editClass.max_students ? Number(editClass.max_students) : null,
      });
      await fetchClasses();
      setEditingId(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not update group.");
    }
  };

  useEffect(() => {
    if (!createOpen && !editingId) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setCreateOpen(false);
        setEditingId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [createOpen, editingId]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 lg:px-8 lg:py-12">
      <div className="flex items-start justify-between gap-6 mb-10">
        <div className="hero-shell p-7 flex-1">
          <p className="eyebrow mb-2">Groups</p>
          <h1 className="title-xl">Your learning spaces</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
            Join with a group code. Inside each group you’ll find announcements, homework, submissions, and grades.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchClasses}
          className="shrink-0 btn-secondary"
        >
          <RefreshCcw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && <div className="mb-6 p-4 rounded-3xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-semibold text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {loading ? (
            <div className="panel p-10 flex justify-center">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : classes.length === 0 ? (
            <div className="panel p-10">
              <p className="text-slate-700 dark:text-slate-300 font-bold">No groups yet.</p>
              <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Use a group code to join, or ask a teacher to create one for you.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(`/classes/${c.id}`)}
                  className="text-left metric-tile p-6 group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-lg font-extrabold text-slate-900 dark:text-white truncate">{c.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate mt-1">
                        {(c.subject ? `${c.subject}` : "—")}
                        {c.lesson_days ? ` · ${c.lesson_days}` : ""}
                        {c.lesson_time ? ` · ${c.lesson_time}` : ""}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">
                    <span>
                      {(c.members_count ?? 0)} students{c.max_students ? ` / ${c.max_students}` : ""}
                    </span>
                    <div className="inline-flex items-center gap-3">
                      {isAdmin && (
                        <span
                          onClick={(e) => { e.stopPropagation(); beginEdit(c); }}
                          className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          Edit
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
                        Open <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="panel p-6">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Join a group</p>
            </div>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Group code"
              className="input-modern font-semibold"
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={!joinCode.trim()}
              className="w-full mt-3 btn-primary disabled:opacity-50"
            >
              Join
            </button>
          </div>

          {isAdmin && (
            <div className="panel p-6">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Teacher tools</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="w-full btn-primary"
              >
                <Plus className="w-4 h-4" />
                Create group
              </button>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 text-center">
                Create and edit groups in a dedicated popup window.
              </p>
            </div>
          )}
        </div>
      </div>

      {isAdmin && createOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setCreateOpen(false)} aria-hidden="true" />
          <div className="relative w-full max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="create-group-title">
            <div className="hero-shell p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p id="create-group-title" className="eyebrow mb-2">Create group</p>
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-900">New group</h2>
                  <p className="text-slate-600 text-sm mt-2">
                    Add a group for your students. Optional fields can be set later.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="btn-secondary inline-flex items-center justify-center !px-3 !py-2"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                className="mt-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleCreate();
                }}
              >
                <Field label="Group name">
                  <input
                    value={newClass.name}
                    onChange={(e) => setNewClass((p) => ({ ...p, name: e.target.value }))}
                    className="input-modern w-full"
                    required
                  />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Subject">
                    <select
                      value={newClass.subject}
                      onChange={(e) => setNewClass((p) => ({ ...p, subject: e.target.value }))}
                      className="input-modern w-full appearance-none"
                    >
                      <option value="ENGLISH">English</option>
                      <option value="MATH">Math</option>
                    </select>
                  </Field>
                  <Field label="Lesson days">
                    <select
                      value={newClass.lesson_days}
                      onChange={(e) => setNewClass((p) => ({ ...p, lesson_days: e.target.value }))}
                      className="input-modern w-full appearance-none"
                    >
                      <option value="ODD">Odd days</option>
                      <option value="EVEN">Even days</option>
                    </select>
                  </Field>
                  <Field label="Lesson time">
                    <input
                      value={newClass.lesson_time}
                      onChange={(e) => setNewClass((p) => ({ ...p, lesson_time: e.target.value }))}
                      placeholder="e.g. 18:00"
                      className="input-modern w-full"
                    />
                  </Field>
                  <Field label="Lesson hours">
                    <input
                      value={newClass.lesson_hours}
                      onChange={(e) => setNewClass((p) => ({ ...p, lesson_hours: e.target.value }))}
                      placeholder="e.g. 2"
                      className="input-modern w-full"
                    />
                  </Field>
                  <Field label="Start date">
                    <input
                      type="date"
                      value={newClass.start_date}
                      onChange={(e) => setNewClass((p) => ({ ...p, start_date: e.target.value }))}
                      className="input-modern w-full"
                    />
                  </Field>
                  <Field label="Room number">
                    <input
                      value={newClass.room_number}
                      onChange={(e) => setNewClass((p) => ({ ...p, room_number: e.target.value }))}
                      placeholder="Optional"
                      className="input-modern w-full"
                    />
                  </Field>
                </div>
                <Field label="Telegram chat ID">
                  <input
                    value={newClass.telegram_chat_url}
                    onChange={(e) => setNewClass((p) => ({ ...p, telegram_chat_url: e.target.value }))}
                    placeholder="Optional"
                    className="input-modern w-full"
                  />
                </Field>
                <Field label="Teacher">
                  <select
                    value={newClass.teacher}
                    onChange={(e) => setNewClass((p) => ({ ...p, teacher: e.target.value }))}
                    className="input-modern w-full appearance-none"
                  >
                    <option value="">Default (you)</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.first_name || t.email} {t.last_name || ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Max students">
                  <input
                    value={newClass.max_students}
                    onChange={(e) => setNewClass((p) => ({ ...p, max_students: e.target.value }))}
                    placeholder="Optional"
                    className="input-modern w-full"
                    inputMode="numeric"
                  />
                </Field>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button type="submit" disabled={!newClass.name.trim() || creating} className="flex-1 btn-primary disabled:opacity-50 min-h-[44px]">
                    {creating ? "Creating…" : "Create group"}
                  </button>
                  <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary min-h-[44px] px-6">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isAdmin && editingId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setEditingId(null)} aria-hidden="true" />
          <div className="relative w-full max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="edit-group-title">
            <div className="hero-shell p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p id="edit-group-title" className="eyebrow mb-2">Edit group</p>
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-900">Update group details</h2>
                  <p className="text-slate-600 text-sm mt-2">Changes apply as soon as you save.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="btn-secondary inline-flex items-center justify-center !px-3 !py-2"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                className="mt-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveEdit();
                }}
              >
                <Field label="Group name">
                  <input
                    value={editClass.name}
                    onChange={(e) => setEditClass((p) => ({ ...p, name: e.target.value }))}
                    className="input-modern w-full"
                    required
                  />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Subject">
                    <select
                      value={editClass.subject}
                      onChange={(e) => setEditClass((p) => ({ ...p, subject: e.target.value }))}
                      className="input-modern w-full appearance-none"
                    >
                      <option value="ENGLISH">English</option>
                      <option value="MATH">Math</option>
                    </select>
                  </Field>
                  <Field label="Room number">
                    <input
                      value={editClass.room_number}
                      onChange={(e) => setEditClass((p) => ({ ...p, room_number: e.target.value }))}
                      className="input-modern w-full"
                    />
                  </Field>
                  <Field label="Start date">
                    <input
                      type="date"
                      value={editClass.start_date}
                      onChange={(e) => setEditClass((p) => ({ ...p, start_date: e.target.value }))}
                      className="input-modern w-full"
                    />
                  </Field>
                  <Field label="Teacher">
                    <select
                      value={editClass.teacher}
                      onChange={(e) => setEditClass((p) => ({ ...p, teacher: e.target.value }))}
                      className="input-modern w-full appearance-none"
                    >
                      <option value="">Not assigned</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.first_name || t.email} {t.last_name || ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Telegram chat ID">
                  <input
                    value={editClass.telegram_chat_id}
                    onChange={(e) => setEditClass((p) => ({ ...p, telegram_chat_id: e.target.value }))}
                    className="input-modern w-full"
                  />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Lesson days">
                    <select
                      value={editClass.lesson_days}
                      onChange={(e) => setEditClass((p) => ({ ...p, lesson_days: e.target.value }))}
                      className="input-modern w-full appearance-none"
                    >
                      <option value="ODD">Odd days</option>
                      <option value="EVEN">Even days</option>
                    </select>
                  </Field>
                  <Field label="Lesson time">
                    <input
                      value={editClass.lesson_time}
                      onChange={(e) => setEditClass((p) => ({ ...p, lesson_time: e.target.value }))}
                      placeholder="e.g. 18:00"
                      className="input-modern w-full"
                    />
                  </Field>
                  <Field label="Lesson hours">
                    <input
                      value={editClass.lesson_hours}
                      onChange={(e) => setEditClass((p) => ({ ...p, lesson_hours: e.target.value }))}
                      placeholder="e.g. 2"
                      className="input-modern w-full"
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button type="submit" className="flex-1 btn-primary min-h-[44px]">
                    Save changes
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="btn-secondary min-h-[44px] px-6">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
