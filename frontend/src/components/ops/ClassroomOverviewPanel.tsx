"use client";

import { CalendarX, CheckCircle2, Clock, School } from "lucide-react";
import { OpsSignalCard } from "@/components/ops/ui";

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
  return "Custom";
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
  const now = new Date();
  const overdueList = assignments.filter(
    (a) => a.due_at && new Date(a.due_at) < now,
  );
  const studentList = students.filter((s) => s.role === "STUDENT");

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

      {/* Signal strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OpsSignalCard value={assignments.length} label="Assignments" />
        <OpsSignalCard value={overdueList.length} label="Overdue" warning />
        <OpsSignalCard value={studentList.length} label="Students" />
        <OpsSignalCard
          value={classroom.members_count ?? students.length}
          label="Members"
        />
      </div>

      {/* Overdue list or all-clear */}
      {overdueList.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-card">
          <div className="flex items-center gap-2 border-b border-amber-100 px-4 py-3">
            <CalendarX className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
              Overdue assignments
            </p>
          </div>
          <div className="divide-y divide-border">
            {overdueList.map((a) => {
              const days = Math.floor(
                (now.getTime() - new Date(a.due_at!).getTime()) / 86_400_000,
              );
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {a.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {formatDate(a.due_at)} · {contentTypeLabel(a)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-amber-600 tabular-nums">
                    +{days}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : assignments.length > 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="text-sm font-semibold text-emerald-800">No overdue assignments.</p>
        </div>
      ) : null}
    </div>
  );
}
