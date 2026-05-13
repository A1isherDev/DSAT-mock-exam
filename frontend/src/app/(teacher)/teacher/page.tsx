"use client";

/**
 * /teacher — Teacher operations dashboard
 *
 * Shows each managed classroom with live operational signals:
 *   - Overdue assignments → intervention needed
 *   - Due-soon assignments → heads-up
 *   - Submission rate → engagement indicator
 *
 * Signals are derived client-side from assignment `due_at` / `submissions_count`.
 * Assignments are loaded in parallel across all classrooms on mount.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import type { NormalizedList, Assignment } from "@/lib/criticalApiContract";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Loader2,
  Plus,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  type AssignmentLifecycleSummary,
  summarizeAssignmentLifecycle,
} from "@/lib/assignmentLifecycle";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClassGroup = {
  id: number;
  name: string;
  subject?: string | null;
  lesson_schedule?: string | null;
  members_count?: number | null;
  max_students?: number | null;
  my_role?: string;
};

type ClassroomWithSignals = ClassGroup & {
  signals: AssignmentLifecycleSummary | null;
  loadingSignals: boolean;
};

// ─── Classroom signal card ────────────────────────────────────────────────────

function ClassSignalBar({ signals }: { signals: AssignmentLifecycleSummary }) {
  if (signals.total === 0) {
    return (
      <p className="text-[11px] text-muted-foreground font-semibold">No assignments yet</p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {signals.overdue > 0 && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-800">
          <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
          {signals.overdue} overdue
        </span>
      )}
      {signals.dueSoon > 0 && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-800">
          <Timer className="h-2.5 w-2.5 shrink-0" />
          {signals.dueSoon} due soon
        </span>
      )}
      {signals.active > 0 && signals.overdue === 0 && signals.dueSoon === 0 && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
          <Zap className="h-2.5 w-2.5 shrink-0" />
          {signals.active} active
        </span>
      )}
      {signals.needsAttention === 0 && signals.total > 0 && (
        <span className="inline-flex items-center gap-1 rounded-lg bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
          <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
          All clear
        </span>
      )}
      <span className="text-[10px] text-muted-foreground">
        {signals.total} assignment{signals.total !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

// ─── Summary panel (across all classrooms) ───────────────────────────────────

function AttentionSummary({
  classrooms,
}: {
  classrooms: ClassroomWithSignals[];
}) {
  const loaded = classrooms.filter((c) => c.signals !== null);
  if (loaded.length === 0) return null;

  const totalOverdue = loaded.reduce((s, c) => s + (c.signals?.overdue ?? 0), 0);
  const totalDueSoon = loaded.reduce((s, c) => s + (c.signals?.dueSoon ?? 0), 0);

  if (totalOverdue === 0 && totalDueSoon === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <p className="text-sm font-bold text-emerald-900">
          All clear — no overdue or urgent assignments across your classes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-bold text-amber-900">Attention needed across your classes</p>
        <div className="flex flex-wrap gap-2">
          {totalOverdue > 0 && (
            <span className="text-xs font-bold text-red-800">
              {totalOverdue} overdue assignment{totalOverdue !== 1 ? "s" : ""}
            </span>
          )}
          {totalDueSoon > 0 && (
            <span className="text-xs font-bold text-orange-800">
              {totalDueSoon} due within 48h
            </span>
          )}
        </div>
        <Link
          href="/ops/assignments"
          className="text-xs font-bold text-primary hover:underline"
        >
          Manage assignments →
        </Link>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomWithSignals[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await classesApi.list();
        const teacherGroups = (all.items as ClassGroup[]).filter((g) => g.my_role === "ADMIN");
        if (cancelled) return;

        // Seed state immediately so the page renders; signals load async
        setClassrooms(
          teacherGroups.map((g) => ({ ...g, signals: null, loadingSignals: true })),
        );
        setLoading(false);

        // Parallel load assignments for all classrooms
        await Promise.allSettled(
          teacherGroups.map(async (g) => {
            try {
              const list: NormalizedList<Assignment> = await classesApi.listAssignments(g.id);
              if (cancelled) return;
              const signals = summarizeAssignmentLifecycle(list.items);
              setClassrooms((prev) =>
                prev.map((c) =>
                  c.id === g.id ? { ...c, signals, loadingSignals: false } : c,
                ),
              );
            } catch {
              if (cancelled) return;
              setClassrooms((prev) =>
                prev.map((c) =>
                  c.id === g.id ? { ...c, signals: null, loadingSignals: false } : c,
                ),
              );
            }
          }),
        );
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        if (!cancelled) {
          setError(typeof msg === "string" ? msg : "Could not load teacher dashboard.");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">
          Teacher
        </p>
        <h1 className="text-xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your classes and operational status at a glance.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      {/* Attention summary — shown once signals are loaded */}
      {!loading && classrooms.length > 0 && (
        <AttentionSummary classrooms={classrooms} />
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/teacher/homework",         icon: ClipboardList,  label: "Homework",    sub: "Manage & assign" },
          { href: "/teacher/homework/grading",  icon: ClipboardCheck, label: "Grading",     sub: "Review submissions" },
          { href: "/teacher/students",          icon: Users,          label: "Students",    sub: "View all students" },
          { href: "/assessments/assign",        icon: BookOpen,       label: "Assessments", sub: "Assign to classes" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group rounded-2xl border border-border bg-card p-4 hover:border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <a.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary mb-2 transition-colors" />
            <p className="text-sm font-extrabold text-foreground">{a.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{a.sub}</p>
          </Link>
        ))}
      </div>

      {/* Classes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest">
            Your classes
          </p>
          <Link
            href="/teacher/homework"
            className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Create assignment
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-5 animate-pulse h-28" />
            ))}
          </div>
        ) : classrooms.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-extrabold text-foreground">No classes yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ask an administrator to create a class and assign you as the teacher.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {classrooms.map((g) => {
              const hasAttention =
                (g.signals?.overdue ?? 0) > 0 || (g.signals?.dueSoon ?? 0) > 0;

              return (
                <Link
                  key={g.id}
                  href={`/ops/classrooms/${g.id}`}
                  className={cn(
                    "group rounded-2xl border bg-card p-5 hover:bg-primary/5 transition-colors flex flex-col gap-3",
                    hasAttention
                      ? "border-amber-200 hover:border-amber-300"
                      : "border-border hover:border-primary/30",
                  )}
                >
                  {/* Name + subject + arrow */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-extrabold text-foreground truncate">{g.name}</p>
                      {g.subject && (
                        <p className="text-xs text-muted-foreground mt-0.5">{g.subject}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                  </div>

                  {/* Student count */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {g.members_count ?? 0}
                      {g.max_students ? ` / ${g.max_students}` : ""} students
                    </span>
                    {g.lesson_schedule && (
                      <span className="text-xs text-muted-foreground">{g.lesson_schedule}</span>
                    )}
                  </div>

                  {/* Operational signals */}
                  <div className="mt-auto">
                    {g.loadingSignals ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
                    ) : g.signals ? (
                      <ClassSignalBar signals={g.signals} />
                    ) : null}
                  </div>

                  {/* Student fill bar */}
                  {g.max_students != null && g.members_count != null && (
                    <div className="h-1 w-full rounded-full bg-surface-2 overflow-hidden -mb-1">
                      <div
                        className="h-full rounded-full bg-primary/40 transition-all"
                        style={{
                          width: `${Math.min(100, Math.round(((g.members_count ?? 0) / g.max_students) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Workflow guide — contextual, only shown when classes exist */}
      {!loading && classrooms.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest mb-3">
            After each class
          </p>
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            {[
              { step: "1", text: "Create homework assignment", href: "/teacher/homework", action: "Create" },
              { step: "2", text: "Monitor submission progress", href: "/ops/assignments", action: "Check" },
              { step: "3", text: "Grade and review submissions", href: "/teacher/homework/grading", action: "Grade" },
            ].map((item) => (
              <Link
                key={item.step}
                href={item.href}
                className="flex items-start gap-2.5 rounded-xl border border-border p-3 hover:border-primary/30 hover:bg-primary/5 transition-colors group"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-extrabold text-primary">
                  {item.step}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">{item.text}</p>
                  <p className="text-xs text-primary font-bold mt-0.5 group-hover:underline">{item.action} →</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
