"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import {
  ClipboardList,
  School,
  Users,
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import type { Classroom } from "@/lib/criticalApiContract";

type OpsStats = {
  totalClassrooms: number;
  managedClassrooms: number;
  totalAssignments: number;
  activeAssignments: number;
};

const QUICK_LINKS = [
  {
    href: "/ops/assignments",
    icon: ClipboardList,
    title: "Assignments",
    description: "Create, monitor, and close homework and assessment assignments across classrooms.",
    cta: "Manage assignments",
    accent: true,
  },
  {
    href: "/ops/classrooms",
    icon: School,
    title: "Classrooms",
    description: "Manage classes, membership, schedules, and classroom-level settings.",
    cta: "View classrooms",
  },
  {
    href: "/ops/users",
    icon: Users,
    title: "Users",
    description: "Manage student and teacher accounts, roles, and access status.",
    cta: "Manage users",
  },
  {
    href: "/ops/scoring-issues",
    icon: AlertOctagon,
    title: "Scoring issues",
    description: "Review and retry failed automated scoring attempts. Requires investigation before requeue.",
    cta: "View issues",
  },
];

export default function OpsDashboardPage() {
  const [stats, setStats] = useState<OpsStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const classroomList = await classesApi.list();
        const managed = classroomList.items.filter(
          (c) => (c as Classroom & { my_role?: string }).my_role === "ADMIN",
        );

        let totalAssignments = 0;
        let activeAssignments = 0;
        await Promise.allSettled(
          managed.slice(0, 20).map(async (c) => {
            try {
              const a = await classesApi.listAssignments(c.id);
              totalAssignments += a.items.length;
              // Treat assignments without is_active flag as potentially active
              activeAssignments += a.items.filter(
                (x) => !(x as Record<string, unknown>).completed_at,
              ).length;
            } catch {
              // ignore individual classroom failures
            }
          }),
        );

        if (!cancelled) {
          setStats({
            totalClassrooms: classroomList.items.length,
            managedClassrooms: managed.length,
            totalAssignments,
            activeAssignments,
          });
        }
      } catch {
        // Stats are non-critical; page still renders without them
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">
          Admin console
        </p>
        <h1 className="text-xl font-bold text-foreground tracking-tight">Operations dashboard</h1>
        <p className="text-muted-foreground mt-1.5">
          Platform operational health. Use the navigation to manage assignments, users, and
          classrooms. Content authoring happens in the{" "}
          <a
            href={
              process.env.NEXT_PUBLIC_QUESTIONS_CONSOLE_URL ??
              "https://questions.mastersat.uz/builder"
            }
            className="font-semibold text-primary hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Questions console
          </a>
          .
        </p>
      </div>

      {/* Stats */}
      {!loading && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard value={stats.totalClassrooms} label="Total classrooms" />
          <StatCard value={stats.managedClassrooms} label="Managed by you" accent />
          <StatCard value={stats.totalAssignments} label="Assignments" />
          <StatCard value={stats.activeAssignments} label="Active" accent />
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-card p-4 animate-pulse h-20"
            />
          ))}
        </div>
      )}

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`group rounded-2xl border p-5 flex flex-col gap-3 transition-colors ${
              link.accent
                ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                : "border-border bg-card hover:border-primary/20 hover:bg-primary/5"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className={`rounded-xl p-2.5 transition-colors ${
                    link.accent ? "bg-primary/10" : "bg-surface-2 group-hover:bg-primary/10"
                  }`}
                >
                  <link.icon
                    className={`h-5 w-5 transition-colors ${
                      link.accent ? "text-primary" : "text-foreground group-hover:text-primary"
                    }`}
                  />
                </div>
                <p className="font-extrabold text-foreground">{link.title}</p>
              </div>
              <ArrowRight
                className={`h-4 w-4 shrink-0 mt-0.5 transition-colors ${
                  link.accent ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                }`}
              />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{link.description}</p>
            <span
              className={`text-xs font-bold ${link.accent ? "text-primary" : "text-primary"}`}
            >
              {link.cta} →
            </span>
          </Link>
        ))}
      </div>

      {/* Ops responsibilities reminder */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
          Responsibility boundary
        </p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
          <div>
            <p className="font-bold text-foreground mb-1">This console handles</p>
            <ul className="space-y-0.5">
              {["Assigning content to classrooms", "User account management", "Classroom operations", "Scoring failure recovery", "Assignment monitoring"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-bold text-foreground mb-1">Questions console handles</p>
            <ul className="space-y-0.5">
              {["Question authoring", "Assessment set creation", "Content publishing", "Category taxonomy", "Publish queue review"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p
        className={`text-2xl font-extrabold tabular-nums ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
