"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { teacherApi } from "@/features/teacher/api";
import CreateAssignmentModal from "@/components/CreateAssignmentModal";
import { AlertTriangle, AlertCircle, CheckCircle2, Plus, Calendar, ClipboardCheck, Pencil, Trash2, Users } from "lucide-react";

const STORAGE_KEY = "teacher_homework_last_group";

export default function TeacherHomeworkPage() {
  const classesApi = teacherApi.classes;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? Number(v) : null;
  });
  const [assignments, setAssignments] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Record<string, unknown> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<number, string>>({});

  const refreshGroups = async () => {
    const all = await classesApi.list();
    const teacherGroups = all.items.filter((g) => g.my_role === "ADMIN");
    setGroups(teacherGroups);
    setSelectedGroupId((prev) => {
      // Keep persisted selection if it's still a valid group; else default to first
      const validIds = new Set(teacherGroups.map((g: any) => g.id));
      if (prev && validIds.has(prev)) return prev;
      const first = teacherGroups[0]?.id ?? null;
      if (first) localStorage.setItem(STORAGE_KEY, String(first));
      return first;
    });
  };

  const refreshAssignments = async (gid: number) => {
    const a = await classesApi.listAssignments(gid);
    setAssignments(a.items);
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
    setCreateOpen(false);
    refreshAssignments(selectedGroupId);
  }, [selectedGroupId]);

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
        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">Homework</p>
        {/* § 4.2 — heading scale aligned to page-level content hierarchy */}
        <h1 className="text-xl font-bold text-foreground tracking-tight">Homework management</h1>
        <p className="text-muted-foreground mt-2">
          Create, edit, and track homework.{" "}
          <Link href="/teacher/homework/grading" className="font-semibold text-primary underline">
            Open grading workspace
          </Link>{" "}
          to review all assignments and students.
        </p>
      </div>

      {error && <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm">{error}</div>}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 flex justify-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
            <div className="rounded-2xl border border-border bg-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Class</p>
                <select
                  value={selectedGroupId ?? ""}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    localStorage.setItem(STORAGE_KEY, String(id));
                    setSelectedGroupId(id);
                  }}
                  className="ui-input w-full sm:w-auto min-w-[200px] rounded-xl px-3 py-2 text-sm font-semibold"
                >
                  <option value="">Select a class</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} {g.subject ? `(${g.subject})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedGroupId ? (
                  <>
                    <Link
                      href="/teacher/homework/grading"
                      className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/15"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      Grade homework
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAssignment(null);
                        setCreateOpen(true);
                      }}
                      className="ms-btn-primary ms-cta-fill inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
                    >
                      <Plus className="w-4 h-4" />
                      Create assignment
                    </button>
                    <Link
                      href={`/classes/${selectedGroupId}`}
                      className="inline-flex items-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-surface-2"
                    >
                      Class page
                    </Link>
                  </>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="border-b border-border p-5 font-bold text-foreground">Assignments</div>
              {assignments.length === 0 ? (
                <div className="p-6 text-muted-foreground">No homework yet. Use "Create assignment" above.</div>
              ) : (
                <div className="divide-y divide-border">
                  {assignments.map((a) => {
                    const isOverdue = !!(a.due_at && new Date(a.due_at) < new Date() && !a.completed_at);
                    const subCount: number | null = a.submissions_count ?? null;
                    const memberCount: number | null = groups.find((g) => g.id === selectedGroupId)?.members_count ?? null;
                    const allIn = subCount != null && memberCount != null && subCount >= memberCount;
                    return (
                    <div key={a.id} className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-0.5">
                            <p className="truncate font-extrabold text-foreground">{a.title}</p>
                            {isOverdue && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                <AlertCircle className="h-3 w-3" />
                                Overdue
                              </span>
                            )}
                            {allIn && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                All in
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5" /> {formatDue(a.due_at)}
                            </p>
                            {subCount != null && (
                              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Users className="w-3.5 h-3.5" />
                                {subCount}{memberCount != null ? ` / ${memberCount}` : ""} submitted
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAssignment(a);
                              setCreateOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </button>
                          {confirmDeleteId === a.id ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!selectedGroupId) return;
                                  setDeleteErrors((prev) => { const n = { ...prev }; delete n[a.id]; return n; });
                                  try {
                                    await classesApi.deleteAssignment(selectedGroupId, a.id);
                                    setConfirmDeleteId(null);
                                    setDeleteErrors((prev) => { const n = { ...prev }; delete n[a.id]; return n; });
                                    await refreshAssignments(selectedGroupId);
                                  } catch (e: unknown) {
                                    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                                    setDeleteErrors((prev) => ({ ...prev, [a.id]: typeof msg === "string" ? msg : "Could not delete." }));
                                    setConfirmDeleteId(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Yes, delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2"
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
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-700 font-bold text-sm hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          )}
                          <Link
                            href={`/classes/${selectedGroupId}/assignments/${a.id}`}
                            className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2"
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
                            Any student submissions will also be removed.
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
        </div>
      )}

      {selectedGroupId ? (
        <CreateAssignmentModal
          open={createOpen}
          classId={selectedGroupId}
          editingAssignment={editingAssignment}
          onClose={() => {
            setCreateOpen(false);
            setEditingAssignment(null);
          }}
          onSuccess={async () => {
            await refreshAssignments(selectedGroupId);
            setEditingAssignment(null);
          }}
        />
      ) : null}
    </div>
  );
}

