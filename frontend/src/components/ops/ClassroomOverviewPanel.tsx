"use client";

/**
 * ClassroomOverviewPanel — classroom detail overview tab.
 *
 * Shows classroom metadata, assignment lifecycle signals, and student summary.
 * Uses the shared `assignmentLifecycle` utility for consistent state derivation.
 */

import { AlertTriangle, CalendarX, CheckCircle2, Clock, School, Timer } from "lucide-react";
import { OpsSignalCard } from "@/components/ops/ui";
import {
  summarizeAssignmentLifecycle,
  deriveAssignmentLifecycleState,
  formatAssignmentDue,
} from "@/lib/assignmentLifecycle";

// ─── Types (shared with the page) ─────────────────────────────────────────────

export type ClassroomSummary = {
  id: number;
  name: string;
  subject?: string;
  join_code?: string;
  lesson_days?: string;
  lesson_time?: string;
  members_count?: number;
  created_at?: string;
};

export type AssignmentSummary = {
  id: number;
  title: string;
  due_at?: string | null;
  created_at: string;
  practice_test?: number | null;
  mock_exam?: number | null;
  pastpaper_pack?: number | null;
  module?: number | null;
  submissions_count?: number | null;
};

export type PersonSummary = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function contentTypeLabel(a: AssignmentSummary): string {
  if (a.mock_exam) return "Mock exam";
  if (a.pastpaper_pack) return "Pastpaper";
  if (a.practice_test) return "Practice test";
  if (a.module) return "Module";
  return "Assessment";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClassroomOverviewPanel({
  classroom,
  assignments,
  students,
}: {
  classroom: ClassroomSummary;
  assignments: AssignmentSummary[];
  students: PersonSummary[];
}) {
  const summary = summarizeAssignmentLifecycle(assignments);
  const studentList = students.filter((s) => s.role === "STUDENT");

  const overdueAssignments = assignments.filter(
    (a) => deriveAssignmentLifecycleState(a) === "OVERDUE",
  );
  const dueSoonAssignments = assignments.filter(
    (a) => deriveAssignmentLifecycleState(a) === "DUE_SOON",
  );

  const subjectLabel =
    classroom.subject === "MATH"
      ? "Mathematics"
      : classroom.subject === "ENGLISH"
        ? "Reading & Writing"
        : classroom.subject;

  return (
    <div className="space-y-5">
      {/* Info card */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-2xl bg-surface-2 p-3">
            <School className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-foreground">{classroom.name}</h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {subjectLabel && <span>{subjectLabel}</span>}
              {classroom.lesson_days && <span>{classroom.lesson_days} days</span>}
              {classroom.lesson_time && <span>{classroom.lesson_time}</span>}
              {classroom.created_at && (
                <span>Created {formatDate(classroom.created_at)}</span>
              )}
            </div>
            {classroom.join_code && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Join code
                </span>
                <span className="font-mono text-sm font-extrabold text-foreground tracking-widest">
                  {classroom.join_code}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lifecycle signal strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OpsSignalCard value={summary.total}      label="Assignments" />
        <OpsSignalCard value={summary.overdue}    label="Overdue"   warning={summary.overdue > 0}  warningVariant="red" />
        <OpsSignalCard value={summary.dueSoon}    label="Due soon"  warning={summary.dueSoon > 0}  warningVariant="orange" />
        <OpsSignalCard value={studentList.length} label="Students" />
      </div>

      {/* Attention items */}
      {overdueAssignments.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-red-200 bg-card">
          <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-3">
            <CalendarX className="h-4 w-4 text-red-600 shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-700">
              Overdue — {overdueAssignments.length} assignment{overdueAssignments.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="divide-y divide-border">
            {overdueAssignments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <Clock className="h-4 w-4 text-red-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Due {formatDate(a.due_at)} · {contentTypeLabel(a)}
                    {(a.submissions_count ?? 0) > 0 && (
                      <span className="ml-1.5 text-foreground font-semibold">
                        · {a.submissions_count} submitted
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-black text-red-700 tabular-nums">
                  {formatAssignmentDue(a.due_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dueSoonAssignments.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-orange-200 bg-card">
          <div className="flex items-center gap-2 border-b border-orange-100 bg-orange-50 px-4 py-3">
            <Timer className="h-4 w-4 text-orange-600 shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700">
              Due soon — {dueSoonAssignments.length} assignment{dueSoonAssignments.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="divide-y divide-border">
            {dueSoonAssignments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <Timer className="h-4 w-4 text-orange-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {contentTypeLabel(a)}
                    {(a.submissions_count ?? 0) > 0 && (
                      <span className="ml-1.5 text-foreground font-semibold">
                        · {a.submissions_count} submitted
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-black text-orange-700 tabular-nums">
                  {formatAssignmentDue(a.due_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All clear */}
      {summary.needsAttention === 0 && summary.total > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="text-sm font-semibold text-emerald-800">
            No overdue or due-soon assignments.
          </p>
        </div>
      )}

      {/* Active count hint */}
      {summary.active > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <p className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{summary.active}</span> active assignment{summary.active !== 1 ? "s" : ""} open
            {summary.completed > 0 && (
              <span className="ml-1">
                · <span className="font-bold text-foreground">{summary.completed}</span> completed
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
