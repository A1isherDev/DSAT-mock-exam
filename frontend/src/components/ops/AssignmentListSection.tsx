"use client";

/**
 * AssignmentListSection — assignment list inside the classroom detail page.
 *
 * Shows assignments for a single classroom with lifecycle state chips.
 * Sorted by urgency (OVERDUE → DUE_SOON → ACTIVE → COMPLETED → NO_DEADLINE).
 */

import { useState } from "react";
import { classesApi } from "@/lib/api";
import { BookOpen, Loader2, PenLine, Plus, Trash2 } from "lucide-react";
import { OpsEmptyState } from "@/components/ops/ui";
import type { AssignmentSummary } from "@/components/ops/ClassroomOverviewPanel";
import { contentTypeLabel, formatDate } from "@/components/ops/ClassroomOverviewPanel";
import {
  deriveAssignmentLifecycleState,
  LIFECYCLE_DISPLAY,
  formatAssignmentDue,
  sortByLifecyclePriority,
} from "@/lib/assignmentLifecycle";
import { cn } from "@/lib/cn";

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

function AssignmentStateChip({ assignment }: { assignment: AssignmentSummary }) {
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

  const sorted = sortByLifecyclePriority(assignments);

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
          {sorted.map((a) => {
            const state = deriveAssignmentLifecycleState(a);
            const isDeleting = deletingId === a.id;
            const dueRelative = formatAssignmentDue(a.due_at);

            return (
              <div
                key={a.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/40",
                  state === "OVERDUE" && "bg-red-50/30",
                  state === "DUE_SOON" && "bg-orange-50/20",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-foreground truncate">{a.title}</p>
                    <span className="text-[10px] font-semibold text-muted-foreground rounded-lg bg-surface-2 px-1.5 py-0.5">
                      {contentTypeLabel(a)}
                    </span>
                    <AssignmentStateChip assignment={a} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Created {formatDate(a.created_at)}
                    {a.due_at && (
                      <span
                        className={cn(
                          "ml-1.5",
                          state === "OVERDUE" && "font-bold text-red-700",
                          state === "DUE_SOON" && "font-bold text-orange-700",
                        )}
                      >
                        · Due {formatDateTime(a.due_at)}{" "}
                        <span className="font-black tabular-nums">({dueRelative})</span>
                      </span>
                    )}
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
