"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { classesApi, adminApi } from "@/lib/api";
import {
  ClassroomAlert,
  ClassroomButton,
  ClassroomCard,
  ClassroomClassListSkeleton,
  ClassroomEmptyState,
  ClassroomField,
  ClassroomModal,
  ClassroomPageHeader,
  crInputClass,
  crSelectClass,
} from "@/components/classroom";
import { ArrowRight, Plus, RefreshCcw, Users } from "lucide-react";

function isoDateToInput(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : "";
}

function teacherIdFromClass(c: {
  teacher?: unknown;
  teacher_details?: { id?: number } | null;
}): string {
  const raw = c?.teacher ?? c?.teacher_details?.id;
  if (raw == null || raw === "") return "";
  if (typeof raw === "object" && raw !== null && "id" in raw) {
    return String((raw as { id: number }).id);
  }
  return String(raw);
}

function parseApiError(e: unknown, fallback: string): string {
  const raw = (e as { response?: { data?: unknown } })?.response?.data;
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "string") return raw.trim() || fallback;
  if (Array.isArray(raw)) {
    return raw.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  }
  if (typeof raw !== "object") return String(raw);
  const d = raw as Record<string, unknown>;
  if (typeof d.detail === "string") return d.detail;
  if (Array.isArray(d.detail)) {
    return d.detail.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  }
  if (d.detail != null && typeof d.detail === "object") {
    return JSON.stringify(d.detail);
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (k === "detail") continue;
    if (Array.isArray(v)) parts.push(`${k}: ${v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}`);
    else if (typeof v === "string") parts.push(`${k}: ${v}`);
    else if (v !== null && typeof v === "object") parts.push(`${k}: ${JSON.stringify(v)}`);
  }
  return parts.length ? parts.join(" ") : fallback;
}

const groupTileClass =
  "group relative w-full overflow-hidden text-left transition-all duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:focus-visible:ring-offset-slate-950";

const groupTileAccent =
  "pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-indigo-500 via-indigo-400 to-cyan-500 opacity-90";

export default function ClassesPage() {
  const router = useRouter();
  const isAdmin = typeof window !== "undefined" && Cookies.get("is_admin") === "true";

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
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
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not load groups.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
    if (isAdmin) {
      adminApi
        .getUsers()
        .then((u) => {
          const list = (Array.isArray(u) ? u : []).filter((x: any) => x.class_teacher_eligible);
          setTeachers(list);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoin = async () => {
    setError(null);
    setJoining(true);
    try {
      const res = await classesApi.join(joinCode.trim());
      const c = res?.classroom;
      if (c?.id) router.push(`/classes/${c.id}`);
      else await fetchClasses();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not join group.");
    } finally {
      setJoining(false);
    }
  };

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      const c = await classesApi.create({
        name: newClass.name.trim(),
        subject: newClass.subject as "ENGLISH" | "MATH",
        lesson_days: newClass.lesson_days as "ODD" | "EVEN",
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
    } catch (e: unknown) {
      setError(parseApiError(e, "Could not create group."));
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
      start_date: isoDateToInput(c.start_date),
      room_number: c.room_number || "",
      telegram_chat_id: c.telegram_chat_id || "",
      teacher: teacherIdFromClass(c),
      max_students: c.max_students != null ? String(c.max_students) : "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError(null);
    setSavingEdit(true);
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
    } catch (e: unknown) {
      setError(parseApiError(e, "Could not update group."));
    } finally {
      setSavingEdit(false);
    }
  };

  const editingClass = editingId ? classes.find((c) => c.id === editingId) : null;
  const editTeacherOptions = useMemo(() => {
    if (!editingClass) return teachers;
    const tid = teacherIdFromClass(editingClass);
    const td = editingClass.teacher_details;
    if (!tid || !td || teachers.some((t) => String(t.id) === String(tid))) {
      return teachers;
    }
    return [
      ...teachers,
      {
        id: td.id,
        email: td.email,
        first_name: td.first_name,
        last_name: td.last_name,
      },
    ];
  }, [editingClass, teachers]);

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
    <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="pointer-events-none absolute inset-0 -z-10 cr-classroom-bg" aria-hidden />

      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <ClassroomPageHeader
          className="flex-1"
          eyebrow="Groups"
          title="Your learning spaces"
          description="Join with a code, open a space for announcements, homework, submissions, and grades."
        />
        <ClassroomButton variant="secondary" size="md" onClick={fetchClasses} disabled={loading} className="shrink-0">
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </ClassroomButton>
      </div>

      {error ? (
        <div className="mb-6">
          <ClassroomAlert tone="error">{error}</ClassroomAlert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {loading ? (
            <ClassroomClassListSkeleton />
          ) : classes.length === 0 ? (
            <ClassroomEmptyState
              icon={Users}
              title="No groups yet"
              description="Enter a group code from your teacher, or wait until an admin creates a space for you."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(`/classes/${c.id}`)}
                  className={`cr-surface rounded-2xl p-6 pl-6 ${groupTileClass}`}
                >
                  <span className={groupTileAccent} aria-hidden />
                  <div className="relative flex items-start justify-between gap-4 pl-2">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-slate-900 dark:text-slate-50">{c.name}</p>
                      <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                        {c.subject || "—"}
                        {c.lesson_days ? ` · ${c.lesson_days}` : ""}
                        {c.lesson_time ? ` · ${c.lesson_time}` : ""}
                      </p>
                    </div>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 transition-transform duration-200 group-hover:scale-105 dark:text-indigo-400">
                      <Users className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="relative mt-5 flex items-center justify-between border-t border-slate-200/70 pt-4 pl-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
                    <span>
                      {c.members_count ?? 0} members
                      {c.max_students ? ` / ${c.max_students} max` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1 text-indigo-600 transition-transform duration-200 group-hover:translate-x-0.5 dark:text-indigo-400">
                      Open
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginEdit(c);
                      }}
                      className="relative mt-3 block w-full pl-2 text-left text-xs font-semibold text-slate-400 transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md dark:hover:text-indigo-400"
                    >
                      Edit details
                    </button>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <ClassroomCard padding="md">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Join a group</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Paste the code your teacher shared.</p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. ABC12XY"
              className={`${crInputClass} mt-4 font-semibold tracking-wide`}
              autoComplete="off"
            />
            <ClassroomButton
              variant="primary"
              size="md"
              className="mt-4 w-full"
              onClick={handleJoin}
              disabled={!joinCode.trim() || joining}
            >
              {joining ? "Joining…" : "Join group"}
            </ClassroomButton>
          </ClassroomCard>

          {isAdmin ? (
            <ClassroomCard padding="md" className="border-indigo-200/50 dark:border-indigo-500/20">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Teacher
                  </p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Create a group</p>
                </div>
              </div>
              <ClassroomButton variant="primary" size="md" className="mt-4 w-full" onClick={() => setCreateOpen(true)}>
                New group
              </ClassroomButton>
            </ClassroomCard>
          ) : null}
        </div>
      </div>

      {isAdmin ? (
        <ClassroomModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          titleId="create-group-title"
          eyebrow="Create group"
          title="New group"
          description="Add a group for your students. You can finish optional fields later."
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <ClassroomField label="Group name" htmlFor="cg-name">
              <input
                id="cg-name"
                value={newClass.name}
                onChange={(e) => setNewClass((p) => ({ ...p, name: e.target.value }))}
                className={crInputClass}
                required
              />
            </ClassroomField>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ClassroomField label="Subject" htmlFor="cg-subject">
                <select
                  id="cg-subject"
                  value={newClass.subject}
                  onChange={(e) => setNewClass((p) => ({ ...p, subject: e.target.value }))}
                  className={crSelectClass}
                >
                  <option value="ENGLISH">English</option>
                  <option value="MATH">Math</option>
                </select>
              </ClassroomField>
              <ClassroomField label="Lesson days" htmlFor="cg-days">
                <select
                  id="cg-days"
                  value={newClass.lesson_days}
                  onChange={(e) => setNewClass((p) => ({ ...p, lesson_days: e.target.value }))}
                  className={crSelectClass}
                >
                  <option value="ODD">Odd days</option>
                  <option value="EVEN">Even days</option>
                </select>
              </ClassroomField>
              <ClassroomField label="Lesson time" htmlFor="cg-time" hint="e.g. 18:00">
                <input
                  id="cg-time"
                  value={newClass.lesson_time}
                  onChange={(e) => setNewClass((p) => ({ ...p, lesson_time: e.target.value }))}
                  className={crInputClass}
                />
              </ClassroomField>
              <ClassroomField label="Lesson hours" htmlFor="cg-hours">
                <input
                  id="cg-hours"
                  value={newClass.lesson_hours}
                  onChange={(e) => setNewClass((p) => ({ ...p, lesson_hours: e.target.value }))}
                  className={crInputClass}
                />
              </ClassroomField>
              <ClassroomField label="Start date" htmlFor="cg-start">
                <input
                  id="cg-start"
                  type="date"
                  value={newClass.start_date}
                  onChange={(e) => setNewClass((p) => ({ ...p, start_date: e.target.value }))}
                  className={crInputClass}
                />
              </ClassroomField>
              <ClassroomField label="Room number" htmlFor="cg-room">
                <input
                  id="cg-room"
                  value={newClass.room_number}
                  onChange={(e) => setNewClass((p) => ({ ...p, room_number: e.target.value }))}
                  placeholder="Optional"
                  className={crInputClass}
                />
              </ClassroomField>
            </div>
            <ClassroomField label="Telegram chat ID" htmlFor="cg-tg">
              <input
                id="cg-tg"
                value={newClass.telegram_chat_url}
                onChange={(e) => setNewClass((p) => ({ ...p, telegram_chat_url: e.target.value }))}
                placeholder="Optional"
                className={crInputClass}
              />
            </ClassroomField>
            <ClassroomField label="Teacher" htmlFor="cg-teacher">
              <select
                id="cg-teacher"
                value={newClass.teacher}
                onChange={(e) => setNewClass((p) => ({ ...p, teacher: e.target.value }))}
                className={crSelectClass}
              >
                <option value="">Default (you)</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.first_name || t.email} {t.last_name || ""}
                  </option>
                ))}
              </select>
            </ClassroomField>
            <ClassroomField label="Max students" htmlFor="cg-max">
              <input
                id="cg-max"
                value={newClass.max_students}
                onChange={(e) => setNewClass((p) => ({ ...p, max_students: e.target.value }))}
                placeholder="Optional"
                className={crInputClass}
                inputMode="numeric"
              />
            </ClassroomField>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
              <ClassroomButton type="button" variant="secondary" className="flex-1" onClick={() => setCreateOpen(false)}>
                Cancel
              </ClassroomButton>
              <ClassroomButton
                type="submit"
                variant="primary"
                className="flex-1"
                disabled={!newClass.name.trim() || creating}
              >
                {creating ? "Creating…" : "Create group"}
              </ClassroomButton>
            </div>
          </form>
        </ClassroomModal>
      ) : null}

      {isAdmin && editingId ? (
        <ClassroomModal
          open={!!editingId}
          onClose={() => setEditingId(null)}
          titleId="edit-group-title"
          eyebrow="Edit group"
          title="Update group"
          description="Changes apply as soon as you save."
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <ClassroomField label="Group name" htmlFor="eg-name">
              <input
                id="eg-name"
                value={editClass.name}
                onChange={(e) => setEditClass((p) => ({ ...p, name: e.target.value }))}
                className={crInputClass}
                required
              />
            </ClassroomField>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ClassroomField label="Subject" htmlFor="eg-subject">
                <select
                  id="eg-subject"
                  value={editClass.subject}
                  onChange={(e) => setEditClass((p) => ({ ...p, subject: e.target.value }))}
                  className={crSelectClass}
                >
                  <option value="ENGLISH">English</option>
                  <option value="MATH">Math</option>
                </select>
              </ClassroomField>
              <ClassroomField label="Room number" htmlFor="eg-room">
                <input
                  id="eg-room"
                  value={editClass.room_number}
                  onChange={(e) => setEditClass((p) => ({ ...p, room_number: e.target.value }))}
                  className={crInputClass}
                />
              </ClassroomField>
              <ClassroomField label="Start date" htmlFor="eg-start">
                <input
                  id="eg-start"
                  type="date"
                  value={editClass.start_date}
                  onChange={(e) => setEditClass((p) => ({ ...p, start_date: e.target.value }))}
                  className={crInputClass}
                />
              </ClassroomField>
              <ClassroomField label="Teacher" htmlFor="eg-teacher">
                <select
                  id="eg-teacher"
                  value={editClass.teacher}
                  onChange={(e) => setEditClass((p) => ({ ...p, teacher: e.target.value }))}
                  className={crSelectClass}
                >
                  <option value="">Not assigned</option>
                  {editTeacherOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name || t.email} {t.last_name || ""}
                    </option>
                  ))}
                </select>
              </ClassroomField>
            </div>
            <ClassroomField label="Telegram chat ID" htmlFor="eg-tg">
              <input
                id="eg-tg"
                value={editClass.telegram_chat_id}
                onChange={(e) => setEditClass((p) => ({ ...p, telegram_chat_id: e.target.value }))}
                className={crInputClass}
              />
            </ClassroomField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ClassroomField label="Lesson days" htmlFor="eg-days">
                <select
                  id="eg-days"
                  value={editClass.lesson_days}
                  onChange={(e) => setEditClass((p) => ({ ...p, lesson_days: e.target.value }))}
                  className={crSelectClass}
                >
                  <option value="ODD">Odd days</option>
                  <option value="EVEN">Even days</option>
                </select>
              </ClassroomField>
              <ClassroomField label="Lesson time" htmlFor="eg-time">
                <input
                  id="eg-time"
                  value={editClass.lesson_time}
                  onChange={(e) => setEditClass((p) => ({ ...p, lesson_time: e.target.value }))}
                  className={crInputClass}
                />
              </ClassroomField>
              <ClassroomField label="Lesson hours" htmlFor="eg-hours">
                <input
                  id="eg-hours"
                  value={editClass.lesson_hours}
                  onChange={(e) => setEditClass((p) => ({ ...p, lesson_hours: e.target.value }))}
                  className={crInputClass}
                />
              </ClassroomField>
            </div>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
              <ClassroomButton type="button" variant="secondary" className="flex-1" onClick={() => setEditingId(null)}>
                Cancel
              </ClassroomButton>
              <ClassroomButton type="submit" variant="primary" className="flex-1" disabled={savingEdit}>
                {savingEdit ? "Saving…" : "Save changes"}
              </ClassroomButton>
            </div>
          </form>
        </ClassroomModal>
      ) : null}
    </div>
  );
}
