"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import CreateAssignmentModal from "@/components/CreateAssignmentModal";
import { Plus, Calendar, Pencil, Trash2, ClipboardCheck } from "lucide-react";

export default function TeacherHomeworkPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Record<string, unknown> | null>(null);

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
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Homework management</h1>
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
                  onChange={(e) => setSelectedGroupId(Number(e.target.value))}
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
                <div className="p-6 text-muted-foreground">No homework yet. Use “Create assignment” above.</div>
              ) : (
                <div className="divide-y divide-border">
                  {assignments.map((a) => (
                    <div key={a.id} className="p-5 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-extrabold text-foreground">{a.title}</p>
                        <p className="mt-1 inline-flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" /> {formatDue(a.due_at)}
                        </p>
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
                        <button
                          type="button"
                          onClick={async () => {
                            if (!selectedGroupId || !confirm(`Delete “${a.title}”?`)) return;
                            try {
                              await classesApi.deleteAssignment(selectedGroupId, a.id);
                              await refreshAssignments(selectedGroupId);
                            } catch (e: unknown) {
                              const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                              alert(typeof msg === "string" ? msg : "Could not delete.");
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-700 font-bold text-sm hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                        <Link
                          href={`/classes/${selectedGroupId}/assignments/${a.id}`}
                          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
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

