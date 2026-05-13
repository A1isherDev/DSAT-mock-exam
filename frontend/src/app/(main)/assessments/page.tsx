"use client";

/**
 * /assessments — Student assessment workspace
 *
 * Pedagogical framing: "What am I learning and improving?"
 * NOT simulation framing: "How do I perform under SAT conditions?"
 *
 * Shows all assessment-type assignments across all enrolled classrooms,
 * grouped by student-facing lifecycle state.
 *
 * Domain: Learning system (Assessment / Homework)
 * NOT: Simulation system (Pastpapers / Mock Exams)
 *
 * Data sources:
 *   - classesApi.list()          → enrolled classrooms
 *   - classesApi.listAssignments(id) → assignments per classroom
 *   Filter: assignments with `assessment_homework != null`
 *   Status: `workflow_status` field on assignment
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import type { Classroom, Assignment, NormalizedList } from "@/lib/criticalApiContract";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PlayCircle,
  RefreshCw,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/cn";
import AuthGuard from "@/components/AuthGuard";
import {
  deriveAssignmentLifecycleState,
  formatAssignmentDue,
  formatAssignmentDueFull,
} from "@/lib/assignmentLifecycle";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClassroomWithRole = Classroom & { my_role?: string };

type AssessmentSet = {
  id: number;
  subject: string;
  category: string;
  title: string;
  description: string;
};

type AssessmentHomework = {
  homework_id: number;
  set?: AssessmentSet | null;
};

type AssignmentWithStatus = Assignment & {
  assessment_homework?: AssessmentHomework | null;
  workflow_status?: string | null;
};

type AssessmentEntry = {
  assignment: AssignmentWithStatus;
  classroomId: number;
  classroomName: string;
  subject?: string;
};

// ─── Student-facing assessment state ─────────────────────────────────────────

/**
 * Combined lifecycle + attempt state for student-facing display.
 * Pedagogically meaningful, not database-oriented.
 */
type AssessmentStudentState =
  | "IN_PROGRESS"  // Attempt started but not submitted
  | "SUBMITTED"    // Submitted; grading in progress
  | "COMPLETED"    // Graded and results available
  | "OVERDUE"      // Past deadline, not started
  | "DUE_SOON"     // Due within 48h
  | "NOT_STARTED"; // Active, no attempt yet

function deriveStudentState(entry: AssessmentEntry): AssessmentStudentState {
  const ws = entry.assignment.workflow_status;
  // Attempt states take precedence over temporal states
  if (ws === "graded" || ws === "completed") return "COMPLETED";
  if (ws === "submitted") return "SUBMITTED";
  if (ws === "in_progress") return "IN_PROGRESS";
  // No attempt — derive from temporal lifecycle
  const temporal = deriveAssignmentLifecycleState(entry.assignment);
  if (temporal === "OVERDUE") return "OVERDUE";
  if (temporal === "DUE_SOON") return "DUE_SOON";
  return "NOT_STARTED";
}

// ─── State display config ─────────────────────────────────────────────────────

const STUDENT_STATE_DISPLAY: Record<
  AssessmentStudentState,
  {
    label: string;
    badgeClasses: string;
    rowClasses: string;
    description: string;
    priority: number;
  }
> = {
  IN_PROGRESS: {
    label: "In progress",
    badgeClasses: "bg-amber-100 text-amber-800",
    rowClasses: "bg-amber-50/40 border-amber-200",
    description: "You've started this. Resume where you left off.",
    priority: 0,
  },
  OVERDUE: {
    label: "Overdue",
    badgeClasses: "bg-red-100 text-red-800",
    rowClasses: "bg-red-50/30 border-red-200",
    description: "Past the due date. Submit as soon as possible.",
    priority: 1,
  },
  DUE_SOON: {
    label: "Due soon",
    badgeClasses: "bg-orange-100 text-orange-800",
    rowClasses: "bg-orange-50/20 border-orange-200",
    description: "Due within 48 hours.",
    priority: 2,
  },
  NOT_STARTED: {
    label: "Not started",
    badgeClasses: "bg-sky-100 text-sky-700",
    rowClasses: "border-border",
    description: "Not started yet.",
    priority: 3,
  },
  SUBMITTED: {
    label: "Submitted",
    badgeClasses: "bg-blue-100 text-blue-800",
    rowClasses: "border-border",
    description: "Submitted — grading in progress.",
    priority: 4,
  },
  COMPLETED: {
    label: "Completed",
    badgeClasses: "bg-emerald-100 text-emerald-800",
    rowClasses: "border-border",
    description: "Graded and reviewed.",
    priority: 5,
  },
};

function sortEntries(entries: AssessmentEntry[]): AssessmentEntry[] {
  return [...entries].sort((a, b) => {
    const pa = STUDENT_STATE_DISPLAY[deriveStudentState(a)].priority;
    const pb = STUDENT_STATE_DISPLAY[deriveStudentState(b)].priority;
    if (pa !== pb) return pa - pb;
    const da = a.assignment.due_at ? new Date(a.assignment.due_at).getTime() : Infinity;
    const db = b.assignment.due_at ? new Date(b.assignment.due_at).getTime() : Infinity;
    return da - db;
  });
}

// ─── Filter config ────────────────────────────────────────────────────────────

type FilterValue = "all" | "pending" | "in_progress" | "completed";

// ─── Sub-components ───────────────────────────────────────────────────────────

function StateChip({ state }: { state: AssessmentStudentState }) {
  const spec = STUDENT_STATE_DISPLAY[state];
  return (
    <span
      title={spec.description}
      className={cn(
        "inline-flex items-center rounded-lg px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide shrink-0",
        spec.badgeClasses,
      )}
    >
      {spec.label}
    </span>
  );
}

function ActionButton({ entry, state }: { entry: AssessmentEntry; state: AssessmentStudentState }) {
  const href = `/assessments/${entry.assignment.id}`;
  const config = {
    IN_PROGRESS: { label: "Resume",      icon: PlayCircle,  primary: true },
    NOT_STARTED: { label: "Start",       icon: PlayCircle,  primary: true },
    OVERDUE:     { label: "Submit now",  icon: AlertTriangle, primary: true },
    DUE_SOON:    { label: "Start",       icon: Timer,       primary: true },
    SUBMITTED:   { label: "View",        icon: ArrowRight,  primary: false },
    COMPLETED:   { label: "Review",      icon: CheckCircle2, primary: false },
  }[state];

  const Icon = config.icon;
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors shrink-0",
        config.primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-border bg-card text-foreground hover:bg-surface-2",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </Link>
  );
}

function AssessmentRow({ entry }: { entry: AssessmentEntry }) {
  const state = deriveStudentState(entry);
  const spec = STUDENT_STATE_DISPLAY[state];
  const set = entry.assignment.assessment_homework?.set;
  const title = entry.assignment.title ?? set?.title ?? "Assignment";
  const category = set?.category;
  const subject = set?.subject ?? entry.subject;
  const dueFull = formatAssignmentDueFull(entry.assignment.due_at);
  const dueRelative = formatAssignmentDue(entry.assignment.due_at);

  const subjectLabel =
    subject === "MATH" ? "Math" :
    subject === "READING_WRITING" || subject === "ENGLISH" ? "Reading & Writing" :
    subject ?? null;

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-2xl border p-4 transition-colors",
        spec.rowClasses,
      )}
    >
      {/* Left: content */}
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* Title + state chip */}
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-extrabold text-foreground text-sm leading-snug">{title}</p>
          <StateChip state={state} />
        </div>

        {/* Classroom context — always visible */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3 w-3 shrink-0" />
            <span className="font-semibold text-foreground/80">{entry.classroomName}</span>
          </span>
          {subjectLabel && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide",
                subjectLabel === "Math" ? "bg-purple-100 text-purple-700" : "bg-teal-100 text-teal-700",
              )}
            >
              {subjectLabel}
            </span>
          )}
          {category && (
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
              {category}
            </span>
          )}
        </div>

        {/* Due date */}
        {entry.assignment.due_at && (
          <p
            className={cn(
              "text-xs font-semibold",
              state === "OVERDUE" ? "text-red-700 font-bold" :
              state === "DUE_SOON" ? "text-orange-700 font-bold" :
              "text-muted-foreground",
            )}
          >
            {dueFull}
            {(state === "OVERDUE" || state === "DUE_SOON") && (
              <span className="ml-1.5 font-black tabular-nums">· {dueRelative}</span>
            )}
          </p>
        )}
      </div>

      {/* Right: action */}
      <ActionButton entry={entry} state={state} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function AssessmentWorkspace() {
  const [entries, setEntries] = useState<AssessmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSignal, setLoadingSignal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    setEntries([]);
    try {
      setLoadingSignal("Loading your classrooms…");
      const classroomList = await classesApi.list();
      const enrolled = (classroomList.items as ClassroomWithRole[]).filter(
        (c) => c.my_role === "STUDENT" || c.my_role == null,
      );

      if (enrolled.length === 0) {
        setLoading(false);
        return;
      }

      setLoadingSignal(`Loading assignments from ${enrolled.length} classroom${enrolled.length !== 1 ? "s" : ""}…`);

      const collected: AssessmentEntry[] = [];

      await Promise.allSettled(
        enrolled.slice(0, 15).map(async (classroom) => {
          try {
            const list: NormalizedList<Assignment> = await classesApi.listAssignments(classroom.id);
            for (const a of list.items) {
              const rich = a as AssignmentWithStatus;
              // Only show assessment-type assignments (have `assessment_homework`)
              if (!rich.assessment_homework) continue;
              collected.push({
                assignment: rich,
                classroomId: classroom.id,
                classroomName: classroom.name ?? `Class #${classroom.id}`,
                subject: (classroom as ClassroomWithRole & { subject?: string }).subject,
              });
            }
          } catch {
            // Individual classroom failures are non-fatal
          }
        }),
      );

      setEntries(sortEntries(collected));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof msg === "string" ? msg : "Could not load your assessments.");
    } finally {
      setLoading(false);
      setLoadingSignal("");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "pending") {
      return entries.filter((e) => {
        const s = deriveStudentState(e);
        return s === "IN_PROGRESS" || s === "NOT_STARTED" || s === "OVERDUE" || s === "DUE_SOON";
      });
    }
    if (filter === "in_progress") {
      return entries.filter((e) => deriveStudentState(e) === "IN_PROGRESS");
    }
    if (filter === "completed") {
      return entries.filter((e) => {
        const s = deriveStudentState(e);
        return s === "COMPLETED" || s === "SUBMITTED";
      });
    }
    return entries;
  }, [entries, filter]);

  const counts = useMemo(() => ({
    pending: entries.filter((e) => {
      const s = deriveStudentState(e);
      return s === "IN_PROGRESS" || s === "NOT_STARTED" || s === "OVERDUE" || s === "DUE_SOON";
    }).length,
    in_progress: entries.filter((e) => deriveStudentState(e) === "IN_PROGRESS").length,
    completed: entries.filter((e) => {
      const s = deriveStudentState(e);
      return s === "COMPLETED" || s === "SUBMITTED";
    }).length,
    overdue: entries.filter((e) => deriveStudentState(e) === "OVERDUE").length,
    dueSoon: entries.filter((e) => deriveStudentState(e) === "DUE_SOON").length,
  }), [entries]);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">
            Learning
          </p>
          <h1 className="text-xl font-extrabold text-foreground tracking-tight">
            My assessments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Homework and assessments assigned by your teachers.
          </p>
        </div>
        {!loading && (
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        )}
      </div>

      {/* Attention banner */}
      {!loading && (counts.overdue > 0 || counts.dueSoon > 0) && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-bold text-amber-900">
              Work needs attention
            </p>
            <p className="text-xs text-amber-700">
              {counts.overdue > 0 && (
                <span className="font-bold text-red-800">
                  {counts.overdue} overdue
                </span>
              )}
              {counts.overdue > 0 && counts.dueSoon > 0 && <span> · </span>}
              {counts.dueSoon > 0 && (
                <span className="font-bold text-orange-800">
                  {counts.dueSoon} due within 48 hours
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      {!loading && entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { value: "all",          label: `All (${entries.length})` },
              { value: "pending",      label: `Pending (${counts.pending})` },
              { value: "in_progress",  label: `In progress (${counts.in_progress})` },
              { value: "completed",    label: `Completed (${counts.completed})` },
            ] as { value: FilterValue; label: string }[]
          ).map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors",
                filter === f.value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            {loadingSignal || "Loading…"}
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty states */}
      {!loading && !error && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-extrabold text-foreground">No assessments yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Your teacher will assign assessments to your classroom. Check back after your next lesson.
          </p>
          <Link
            href="/classes"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors"
          >
            View your classes →
          </Link>
        </div>
      )}

      {!loading && !error && entries.length > 0 && filtered.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="font-semibold text-muted-foreground">
            No {filter === "pending" ? "pending" : filter === "in_progress" ? "in-progress" : "completed"} assessments.
          </p>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="mt-2 text-xs font-bold text-primary hover:underline"
          >
            Show all →
          </button>
        </div>
      )}

      {/* Assignment list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map((entry) => (
            <AssessmentRow
              key={`${entry.classroomId}-${entry.assignment.id}`}
              entry={entry}
            />
          ))}
        </div>
      )}

      {/* Domain separator — clear pedagogical boundary */}
      {!loading && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Assessments</span> are classroom homework —
            not SAT simulation.
          </p>
          <Link
            href="/mock-exam"
            className="shrink-0 text-xs font-bold text-primary hover:underline"
          >
            Go to mock exams →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function AssessmentsPage() {
  return (
    <AuthGuard>
      <AssessmentWorkspace />
    </AuthGuard>
  );
}
