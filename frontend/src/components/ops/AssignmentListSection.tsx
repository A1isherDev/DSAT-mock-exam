"use client";

import { useState } from "react";
import { classesApi } from "@/lib/api";
import { BookOpen, Loader2, PenLine, Plus, Trash2 } from "lucide-react";
import { OpsEmptyState, OpsStatusBadge } from "@/components/ops/ui";
import type { AssignmentSummary } from "@/components/ops/ClassroomOverviewPanel";
import { contentTypeLabel, formatDate } from "@/components/ops/ClassroomOverviewPanel";

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isOverdue(due_at: string | null | undefined): boolean {
  if (!due_at) return false;
  return new Date(due_at) < new Date();
}

export function AssignmentListSection({
  classroomId,
  assignments,
  onNewAssignment,
  onEditAssignment,
  onDeleteAssignment,
}: {
  classroomId: number;
  assignments: AssignmentSummary[];
  onNewAssignment: () => void;
  onEditAssignment: (a: AssignmentSummary) => void;
  onDeleteAssignment: (id: number) => void;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = async (a: AssignmentSummary) => {
    if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    setDeletingId(a.id);
    try {
      await classesApi.deleteAssignment(classroomId, a.id);
      onDeleteAssignment(a.id);
    } catch {
      alert("Could not delete assignment.");
    } finally {
      setDeletingId(null);
    }
  };

  const newBtn = (
    <button
      type="button"
      onClick={onNewAssignment}
      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
    >
      <Plus className="h-4 w-4" />
      New assignment
    </button>
  );

  if (assignments.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">{newBtn}</div>
        <OpsEmptyState
          icon={BookOpen}
          title="No assignments yet"
          description="Create the first assignment for this classroom."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">
          {assignments.length} assignment{assignments.length !== 1 ? "s" : ""}
        </p>
        {newBtn}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="divide-y divide-border">
          {assignments.map((a) => {
            const overdue = isOverdue(a.due_at);
            const isDeleting = deletingId === a.id;
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-foreground truncate">{a.title}</p>
                    <span className="text-[10px] font-semibold text-muted-foreground rounded-lg bg-surface-2 px-1.5 py-0.5">
                      {contentTypeLabel(a)}
                    </span>
                    {overdue && (
                      <OpsStatusBadge label="Overdue" variant="overdue" />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Created {formatDate(a.created_at)}
                    {a.due_at && ` · Due ${formatDateTime(a.due_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEditAssignment(a)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
                    title="Edit"
                  >
                    <PenLine className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(a)}
                    disabled={isDeleting}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                    title="Delete"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
