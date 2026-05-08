"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import type { Classroom, Assignment, NormalizedList } from "@/lib/criticalApiContract";
import CreateAssignmentModal from "@/components/CreateAssignmentModal";
import {
  Plus,
  Calendar,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  ClipboardCheck,
  Filter,
  AlertTriangle,
  School,
} from "lucide-react";
import { cn } from "@/lib/cn";

type ClassroomWithRole = Classroom & { my_role?: string; subject?: string };

type AssignmentRow = Assignment & {
  classroomId: number;
  classroomName: string;
  subject?: string;
};

function formatDue(s?: string | null): string {
  if (!s) return "No deadline";
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function isOverdue(dueAt?: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}

export default function OpsAssignmentsPage() {
  const [classrooms, setClassrooms] = useState<ClassroomWithRole[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Record<string, unknown> | null>(null);

  const [search, setSearch] = useState("");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  // Load classrooms on mount
  const loadClassrooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await classesApi.list();
      const managed = (list.items as ClassroomWithRole[]).filter((c) => c.my_role === "ADMIN");
      setClassrooms(managed);
      if (managed.length > 0 && !selectedClassroomId) {
        setSelectedClassroomId(managed[0].id);
      }
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Could not load classrooms.");
    } finally {
      setLoading(false);
    }
  }, [selectedClassroomId]);

  useEffect(() => {
    loadClassrooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load assignments whenever classroom selection changes
  const loadAssignments = useCallback(
    async (classroomId: number) => {
      setLoadingAssignments(true);
      try {
        const list: NormalizedList<Assignment> = await classesApi.listAssignments(classroomId);
        const classroom = classrooms.find((c) => c.id === classroomId);
        setAssignments(
          list.items.map((a) => ({
            ...a,
            classroomId,
            classroomName: classroom?.name ?? `Class #${classroomId}`,
            subject: classroom?.subject,
          })),
        );
      } catch {
        setAssignments([]);
      } finally {
        setLoadingAssignments(false);
      }
    },
    [classrooms],
  );

  useEffect(() => {
    if (!selectedClassroomId) return;
    loadAssignments(selectedClassroomId);
  }, [selectedClassroomId, loadAssignments]);

  const filtered = useMemo(() => {
    let result = assignments;
    if (search.trim().length >= 2) {
      const term = search.toLowerCase().trim();
      result = result.filter(
        (a) =>
          (a.title ?? "").toLowerCase().includes(term) ||
          a.classroomName.toLowerCase().includes(term),
      );
    }
    if (showOverdueOnly) {
      result = result.filter((a) => isOverdue(a.due_at));
    }
    return result.sort((a, b) => {
      // Upcoming first, then overdue, then no deadline
      const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return da - db;
    });
  }, [assignments, search, showOverdueOnly]);

  const overdueCount = useMemo(
    () => assignments.filter((a) => isOverdue(a.due_at)).length,
    [assignments],
  );

  const handleDelete = async (a: AssignmentRow) => {
    if (!confirm(`Delete assignment "${a.title}"?\n\nThis cannot be undone.`)) return;
    try {
      await classesApi.deleteAssignment(a.classroomId, a.id);
      if (selectedClassroomId) await loadAssignments(selectedClassroomId);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(typeof detail === "string" ? detail : "Could not delete assignment.");
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">
            Admin console · Assignments
          </p>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Assignment management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage homework and assessment assignments. Assignments are classroom-scoped
            and always reference published content snapshots.
          </p>
        </div>

        {selectedClassroomId && (
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
              onClick={() => {
                setEditingAssignment(null);
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create assignment
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Classroom selector + search toolbar */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Classroom picker */}
          <div className="flex flex-col gap-1 min-w-[180px] flex-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Classroom
            </span>
            {loading ? (
              <div className="h-9 w-full rounded-xl border border-border bg-surface-2 animate-pulse" />
            ) : (
              <select
                value={selectedClassroomId ?? ""}
                onChange={(e) => setSelectedClassroomId(Number(e.target.value))}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold"
              >
                <option value="">Select a classroom</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.subject ? ` (${c.subject})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Search
            </span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                placeholder="Filter by title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Overdue filter */}
          {overdueCount > 0 && (
            <div className="flex flex-col gap-1 justify-end">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-0 select-none">
                &nbsp;
              </span>
              <button
                type="button"
                onClick={() => setShowOverdueOnly((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-colors",
                  showOverdueOnly
                    ? "border-amber-300 bg-amber-100 text-amber-800"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-2",
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Overdue ({overdueCount})
              </button>
            </div>
          )}

          {selectedClassroomId && (
            <div className="flex flex-col gap-1 justify-end">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-0 select-none">
                &nbsp;
              </span>
              <Link
                href={`/classes/${selectedClassroomId}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors"
              >
                <School className="h-3.5 w-3.5" />
                Class page
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Assignments list */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between gap-2">
          <p className="font-bold text-foreground">
            {loadingAssignments
              ? "Loading…"
              : `${filtered.length} assignment${filtered.length === 1 ? "" : "s"}`}
          </p>
          {selectedClassroomId && (
            <button
              type="button"
              onClick={() => loadAssignments(selectedClassroomId)}
              className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          )}
        </div>

        {!selectedClassroomId ? (
          <div className="p-8 text-center text-muted-foreground">
            <School className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Select a classroom to view assignments.</p>
          </div>
        ) : loadingAssignments ? (
          <div className="flex justify-center p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">
              {assignments.length === 0
                ? "No assignments in this classroom yet."
                : "No assignments match your filters."}
            </p>
            {assignments.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setEditingAssignment(null);
                  setCreateOpen(true);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create first assignment
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((a) => {
              const overdue = isOverdue(a.due_at);
              return (
                <div
                  key={`${a.classroomId}-${a.id}`}
                  className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <p className="font-extrabold text-foreground truncate">
                        {a.title ?? "Untitled assignment"}
                      </p>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 uppercase tracking-wide">
                          <AlertTriangle className="h-3 w-3" />
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      {formatDue(a.due_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAssignment(a as unknown as Record<string, unknown>);
                        setCreateOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-surface-2 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                    <Link
                      href={`/classes/${a.classroomId}/assignments/${a.id}`}
                      className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-surface-2 transition-colors"
                    >
                      View
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/edit modal */}
      {selectedClassroomId ? (
        <CreateAssignmentModal
          open={createOpen}
          classId={selectedClassroomId}
          editingAssignment={editingAssignment}
          onClose={() => {
            setCreateOpen(false);
            setEditingAssignment(null);
          }}
          onSuccess={async () => {
            await loadAssignments(selectedClassroomId);
            setEditingAssignment(null);
          }}
        />
      ) : null}
    </div>
  );
}
