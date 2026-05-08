"use client";

/**
 * StudentTaskPrioritySection
 *
 * The "What needs attention now" section for the student dashboard.
 * Renders ABOVE all other dashboard cards, ensuring the most time-sensitive
 * work is always the first thing a student sees on login.
 *
 * Priority order (governance-aligned):
 *   1. Overdue assignments (red urgency)
 *   2. Due soon (within 48h, amber urgency)
 *   3. Active assignments (normal)
 *   4. Continue incomplete attempt (if no assignments)
 *   5. Nothing to do — empty state
 *
 * Design principle: if a student has work due, they see it instantly.
 * This component does NOT render at all if there's nothing pending.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import type { Classroom, Assignment, NormalizedList } from "@/lib/criticalApiContract";
import {
  AlertTriangle,
  Clock,
  ClipboardList,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/cn";

type ClassroomWithRole = Classroom & { my_role?: string };

type PendingAssignment = {
  assignment: Assignment;
  classroomId: number;
  classroomName: string;
  urgency: "overdue" | "due_soon" | "active";
  hoursUntilDue: number | null;
};

function classifyUrgency(dueAt?: string | null): {
  urgency: PendingAssignment["urgency"];
  hoursUntilDue: number | null;
} {
  if (!dueAt) return { urgency: "active", hoursUntilDue: null };
  const msUntil = new Date(dueAt).getTime() - Date.now();
  const hours = msUntil / (1000 * 60 * 60);
  if (hours < 0) return { urgency: "overdue", hoursUntilDue: hours };
  if (hours <= 48) return { urgency: "due_soon", hoursUntilDue: hours };
  return { urgency: "active", hoursUntilDue: hours };
}

function formatRelativeDue(dueAt?: string | null, hoursUntilDue?: number | null): string {
  if (!dueAt) return "No deadline";
  if (hoursUntilDue == null) return "";
  if (hoursUntilDue < 0) {
    const h = Math.abs(hoursUntilDue);
    if (h < 24) return `Overdue ${Math.round(h)}h ago`;
    return `Overdue ${Math.round(h / 24)}d ago`;
  }
  if (hoursUntilDue < 1) return `Due in ${Math.round(hoursUntilDue * 60)} minutes`;
  if (hoursUntilDue < 24) return `Due in ${Math.round(hoursUntilDue)} hours`;
  return `Due in ${Math.round(hoursUntilDue / 24)} days`;
}

const URGENCY_STYLES = {
  overdue: {
    border: "border-red-200",
    bg: "bg-red-50",
    icon: "text-red-600",
    badge: "bg-red-100 text-red-800",
    badgeLabel: "Overdue",
  },
  due_soon: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    icon: "text-amber-600",
    badge: "bg-amber-100 text-amber-800",
    badgeLabel: "Due soon",
  },
  active: {
    border: "border-border",
    bg: "bg-card",
    icon: "text-muted-foreground",
    badge: "bg-surface-2 text-muted-foreground",
    badgeLabel: "Active",
  },
} as const;

type Props = {
  /** Whether the parent dashboard has already loaded its own data. */
  dashboardLoaded: boolean;
};

export function StudentTaskPrioritySection({ dashboardLoaded }: Props) {
  const [pending, setPending] = useState<PendingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Wait for the parent dashboard to load first, so we don't double-spin
    if (!dashboardLoaded) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const classroomList = await classesApi.list();
        const enrolled = (classroomList.items as ClassroomWithRole[]).filter(
          (c) => c.my_role === "STUDENT" || c.my_role === undefined,
        );

        const results: PendingAssignment[] = [];

        await Promise.allSettled(
          enrolled.slice(0, 10).map(async (classroom) => {
            try {
              const list: NormalizedList<Assignment> = await classesApi.listAssignments(
                classroom.id,
              );
              for (const a of list.items) {
                // Only show truly pending assignments (not completed)
                const status = (a as Assignment & { workflow_status?: string }).workflow_status;
                const isCompleted =
                  status === "completed" ||
                  status === "submitted" ||
                  status === "graded";
                if (isCompleted) continue;

                const { urgency, hoursUntilDue } = classifyUrgency(a.due_at);
                results.push({
                  assignment: a,
                  classroomId: classroom.id,
                  classroomName: classroom.name ?? `Class #${classroom.id}`,
                  urgency,
                  hoursUntilDue,
                });
              }
            } catch {
              // individual classroom failures are silent
            }
          }),
        );

        if (!cancelled) {
          // Sort: overdue → due_soon → active, then by due date
          results.sort((a, b) => {
            const order = { overdue: 0, due_soon: 1, active: 2 };
            const od = order[a.urgency] - order[b.urgency];
            if (od !== 0) return od;
            const da = a.assignment.due_at ? new Date(a.assignment.due_at).getTime() : Infinity;
            const db = b.assignment.due_at ? new Date(b.assignment.due_at).getTime() : Infinity;
            return da - db;
          });
          setPending(results);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboardLoaded]);

  // Don't render anything until both the parent and this section have loaded
  if (!loaded && !loading) return null;
  if (loading && !dashboardLoaded) return null;

  // Nothing pending → don't take up space in the layout
  if (loaded && pending.length === 0) return null;

  const overdueCount = pending.filter((p) => p.urgency === "overdue").length;
  const dueSoonCount = pending.filter((p) => p.urgency === "due_soon").length;

  return (
    <section className="mb-6" aria-label="Pending assignments">
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wide">
            Needs attention
          </h2>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-800">
              <AlertTriangle className="h-2.5 w-2.5" />
              {overdueCount} overdue
            </span>
          )}
          {dueSoonCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
              <Clock className="h-2.5 w-2.5" />
              {dueSoonCount} due soon
            </span>
          )}
        </div>
        <Link
          href="/classes"
          className="text-xs font-bold text-primary hover:underline"
        >
          All classes →
        </Link>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-2 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Assignment cards */}
      {!loading && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pending.slice(0, 6).map((p) => {
            const style = URGENCY_STYLES[p.urgency];
            const relDue = formatRelativeDue(p.assignment.due_at, p.hoursUntilDue);
            return (
              <Link
                key={`${p.classroomId}-${p.assignment.id}`}
                href={`/classes/${p.classroomId}/assignments/${p.assignment.id}`}
                className={cn(
                  "group flex flex-col gap-2 rounded-2xl border p-4 transition-colors hover:border-primary/30 hover:bg-primary/5",
                  style.border,
                  style.bg,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-foreground truncate text-sm">
                      {p.assignment.title ?? "Untitled assignment"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.classroomName}</p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-lg px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide shrink-0",
                      style.badge,
                    )}
                  >
                    {style.badgeLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "text-xs font-bold",
                      p.urgency === "overdue"
                        ? "text-red-700"
                        : p.urgency === "due_soon"
                          ? "text-amber-700"
                          : "text-muted-foreground",
                    )}
                  >
                    {relDue}
                  </p>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            );
          })}

          {/* Show more hint if more than 6 */}
          {pending.length > 6 && (
            <Link
              href="/classes"
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card p-4 text-sm font-bold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              <span>+{pending.length - 6} more</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
