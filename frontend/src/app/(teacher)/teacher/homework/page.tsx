"use client";

/**
 * /teacher/homework — Teacher homework management
 *
 * Classroom-scoped assignment list with lifecycle state chips.
 * Uses the shared `assignmentLifecycle` utility for state derivation.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { teacherApi } from "@/features/teacher/api";
import CreateAssignmentModal from "@/components/CreateAssignmentModal";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Pencil,
  Plus,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  deriveAssignmentLifecycleState,
  LIFECYCLE_DISPLAY,
  formatAssignmentDue,
  formatAssignmentDueFull,
  sortByLifecyclePriority,
  summarizeAssignmentLifecycle,
} from "@/lib/assignmentLifecycle";

const STORAGE_KEY = "teacher_homework_last_group";

type ClassGroup = {
  id: number;
  name: string;
  subject?: string | null;
  my_role?: string;
  members_count?: number | null;
};

type AssignmentItem = {
  id: number;
  title: string;
  due_at?: string | null;
  submissions_count?: number | null;
  created_at?: string;
  [key: string]: unknown;
};

function AssignmentStateChip({ assignment }: { assignment: AssignmentItem }) {
  const state = deriveAssignmentLifecycleState(assignment);
  const spec = LIFECYCLE_DISPLAY[state];
  return (
    <span
      title={spec.description}
      className={cn(
        "inline-flex items-center rounded-lg px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide",
        spec.badgeClasses,
      )}
    >
      {spec.label}
    </span>
  );
}

export default function TeacherHomeworkPage() {
  const classesApi = teacherApi.classes;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? Number(v) : null;
  });
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Record<string, unknown> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({});

  const refreshGroups = async () => {
    const all = await classesApi.list();
    const teacherGroups = (all.items as ClassGroup[]).filter((g) => g.my_role === "ADMIN");
    setGroups(teacherGroups);
    setSelectedGroupId((prev) => {
      const validIds = new Set(teacherGroups.map((g) => g.id));
      if (prev && validIds.has(prev)) return prev;
      const first = teacherGroups[0]?.id ?? null;
      if (first) localStorage.setItem(STORAGE_KEY, String(first));
      return first;
    });
  };

  const refreshAssignments = async (gid: number) => {
    const a = await classesApi.listAssignments(gid);
    setAssignments(a.items as AssignmentItem[]);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await refreshGroups();
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        if (!cancelled) setError(typeof msg === "string" ? msg : "Could not load groups.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedGroupId) return;
    setCreateOpen(false);
    void refreshAssignments(selectedGroupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  const sorted = useMemo(() => sortByLifecyclePriority(assignments), [assignments]);
  const summary = useMemo(() => summarizeAssignmentLifecycle(assignments), [assignments]);
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">
          Teacher · Homework
        </p>
        <h1 className="text-xl font-bold text-foreground tracking-tight">Homework management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage assignments by classroom.{" "}
          <Link href="/teacher/homework/grading" className="font-semibold text-primary underline">
            Open grading workspace →
          </Link>
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 flex justify-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Classroom selector + actions */}
          <div className="rounded-2xl border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
                Classroom
              </p>
              <select
                value={selectedGroupId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  localStorage.setItem(STORAGE_KEY, String(id));
                  setSelectedGroupId(id);
                }}
                className="w-full sm:w-auto min-w-[220px] rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold"
              >
                <option value="">Select a classroom</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}{g.subject ? ` (${g.subject})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {selectedGroupId && (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/teacher/homework/grading"
                  className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/15 transition-colors"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Grade homework
                </Link>
                <button
                  type="button"
                  onClick={() => { setEditingAssignment(null); setCreateOpen(true); }}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create assignment
                </button>
                <Link
                  href={`/ops/classrooms/${selectedGroupId}`}
                  className="inline-flex items-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors"
                >
                  Classroom
                </Link>
              </div>
            )}
          </div>

          {/* Attention signal — shown when there are urgent items */}
          {selectedGroupId && assignments.length > 0 && summary.needsAttention > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-900">
                  {summary.overdue > 0 && (
                    <span className="text-red-800">
                      {summary.overdue} overdue{summary.overdue !== 1 ? " assignments" : " assignment"}
                    </span>
                  )}
                  {summary.overdue > 0 && summary.dueSoon > 0 && <span className="text-amber-600"> · </span>}
                  {summary.dueSoon > 0 && (
                    <span className="text-orange-800">
                      {summary.dueSoon} due within 48 hours
                    </span>
                  )}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Extend due dates or review submission progress.
                </p>
              </div>
            </div>
          )}

          {/* Assignment list */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4 flex items-center justify-between">
              <p className="font-bold text-foreground">
                {assignments.length > 0 ? `${assignments.length} assignment${assignments.length !== 1 ? "s" : ""}` : "Assignments"}
              </p>
              {summary.total > 0 && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {summary.overdue > 0 && (
                    <span className="font-bold text-red-700">{summary.overdue} overdue</span>
                  )}
                  {summary.active > 0 && (
                    <span className="font-semibold text-emerald-700">{summary.active} active</span>
                  )}
                  {summary.completed > 0 && (
                    <span className="font-semibold">{summary.completed} completed</span>
                  )}
                </div>
              )}
            </div>

            {!selectedGroupId ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="font-semibold">Select a classroom to view assignments.</p>
              </div>
            ) : assignments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <ClipboardCheck className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="font-semibold">No assignments yet.</p>
                <button
                  type="button"
                  onClick={() => { setEditingAssignment(null); setCreateOpen(true); }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create first assignment
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sorted.map((a) => {
                  const state = deriveAssignmentLifecycleState(a);
                  const subCount = a.submissions_count ?? null;
                  const memberCount = selectedGroup?.members_count ?? null;
                  const allIn =
                    subCount != null && memberCount != null && subCount >= memberCount;
                  const dueRelative = formatAssignmentDue(a.due_at);
                  const dueFull = formatAssignmentDueFull(a.due_at);

                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "p-5 space-y-3",
                        state === "OVERDUE" && "bg-red-50/30",
                        state === "DUE_SOON" && "bg-orange-50/20",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {/* Title + state chips */}
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="truncate font-extrabold text-foreground">{a.title}</p>
                            <AssignmentStateChip assignment={a} />
                            {allIn && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                All in
                              </span>
                            )}
                          </div>

                          {/* Timing + submissions */}
                          <div className="flex flex-wrap items-center gap-3">
                            <span
                              title={dueFull}
                              className={cn(
                                "inline-flex items-center gap-1.5 text-xs",
                                state === "OVERDUE" ? "font-bold text-red-700" :
                                state === "DUE_SOON" ? "font-bold text-orange-700" :
                                "text-muted-foreground",
                              )}
                            >
                              <Calendar className="h-3.5 w-3.5 shrink-0" />
                              {dueFull}
                              {(state === "OVERDUE" || state === "DUE_SOON") && (
                                <span className="font-black tabular-nums">({dueRelative})</span>
                              )}
                            </span>
                            {subCount != null && (
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Users className="h-3.5 w-3.5 shrink-0" />
                                <span className={cn(
                                  "font-semibold",
                                  subCount === 0 && state === "OVERDUE" ? "text-red-600" : "text-foreground",
                                )}>
                                  {subCount}
                                  {memberCount != null && ` / ${memberCount}`}
                                </span>
                                {" "}submitted
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingAssignment(a as Record<string, unknown>); setCreateOpen(true); }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-surface-2 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          {confirmDeleteId === a.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!selectedGroupId) return;
                                  setDeleteErrors((prev) => { const n = { ...prev }; delete n[a.id]; return n; });
                                  try {
                                    await classesApi.deleteAssignment(selectedGroupId, a.id);
                                    setConfirmDeleteId(null);
                                    await refreshAssignments(selectedGroupId);
                                  } catch (e: unknown) {
                                    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                                    setDeleteErrors((prev) => ({ ...prev, [a.id]: typeof msg === "string" ? msg : "Could not delete." }));
                                    setConfirmDeleteId(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Yes, delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-surface-2 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteErrors((prev) => { const n = { ...prev }; delete n[a.id]; return n; });
                                setConfirmDeleteId(a.id);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          )}
                          <Link
                            href={`/classes/${selectedGroupId}/assignments/${a.id}`}
                            className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-surface-2 transition-colors"
                          >
                            View
                          </Link>
                        </div>
                      </div>

                      {/* Inline delete confirmation */}
                      {confirmDeleteId === a.id && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                          <p className="text-sm font-semibold text-red-800">
                            Delete <span className="font-extrabold">"{a.title}"</span>?
                            Student submissions will also be removed.
                          </p>
                        </div>
                      )}
                      {deleteErrors[a.id] && (
                        <p className="text-sm font-semibold text-red-700">{deleteErrors[a.id]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* All clear */}
          {selectedGroupId && assignments.length > 0 && summary.needsAttention === 0 && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-sm font-semibold text-emerald-800">
                No overdue or urgent assignments.{" "}
                {summary.active > 0 && (
                  <span>{summary.active} active assignment{summary.active !== 1 ? "s" : ""} running.</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {selectedGroupId ? (
        <CreateAssignmentModal
          open={createOpen}
          classId={selectedGroupId}
          editingAssignment={editingAssignment}
          onClose={() => { setCreateOpen(false); setEditingAssignment(null); }}
          onSuccess={async () => {
            await refreshAssignments(selectedGroupId);
            setEditingAssignment(null);
          }}
        />
      ) : null}
    </div>
  );
}
