"use client";

import { ClipboardList, ArrowUpRight } from "lucide-react";

const TEACHER_PORTAL_URL = process.env.NEXT_PUBLIC_TEACHER_PORTAL_URL || "https://teacher.mastersat.uz";

// Operational assignment management was moved to the Teacher Portal as part of Admin
// Simplification. Admin/Ops is governance-only and no longer creates/edits/deletes
// classroom assignments. (Midterm/assessment authoring remains under their own admin tools.)
export default function OpsAssignmentsMovedPage() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2">
        <ClipboardList className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold text-foreground">Assignments moved to the Teacher Portal</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Teachers now create and manage classroom assignments (homework, assessments, past papers,
        midterms) directly in their classroom workspace. Admin is governance-only.
      </p>
      <a
        href={`${TEACHER_PORTAL_URL}/teacher/classrooms`}
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
      >
        Open Teacher Portal <ArrowUpRight className="h-4 w-4" />
      </a>
    </div>
  );
}
