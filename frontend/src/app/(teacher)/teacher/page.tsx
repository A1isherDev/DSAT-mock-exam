"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { teacherApi } from "@/features/teacher/api";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Plus,
  Users,
} from "lucide-react";

type ClassGroup = {
  id: number;
  name: string;
  subject?: string | null;
  lesson_schedule?: string | null;
  members_count?: number | null;
  max_students?: number | null;
  my_role?: string;
};

export default function TeacherDashboardPage() {
  const classesApi = teacherApi.classes;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<ClassGroup[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await classesApi.list();
        const teacherGroups = (all.items as ClassGroup[]).filter((g) => g.my_role === "ADMIN");
        if (cancelled) return;
        setGroups(teacherGroups);
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        if (!cancelled) setError(typeof msg === "string" ? msg : "Could not load teacher dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
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
          Your classes and quick actions.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/teacher/homework", icon: ClipboardList, label: "Homework", sub: "Manage & assign" },
          { href: "/teacher/homework/grading", icon: ClipboardCheck, label: "Grading", sub: "Review submissions" },
          { href: "/teacher/students", icon: Users, label: "Students", sub: "View all students" },
          { href: "/assessments/assign", icon: BookOpen, label: "Assessments", sub: "Assign to classes" },
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
              <div
                key={i}
                className="rounded-2xl border border-border bg-card p-5 animate-pulse h-24"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-extrabold text-foreground">No classes yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ask an administrator to create a class and assign you as the teacher.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={`/classes/${g.id}`}
                className="group rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:bg-primary/5 transition-colors flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-foreground truncate">{g.name}</p>
                    {g.subject && (
                      <p className="text-xs text-muted-foreground mt-0.5">{g.subject}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-auto">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {g.members_count ?? 0}
                    {g.max_students ? ` / ${g.max_students}` : ""} students
                  </span>
                  {g.lesson_schedule && (
                    <span className="text-xs text-muted-foreground">{g.lesson_schedule}</span>
                  )}
                </div>

                {/* Health signal: full / has-room */}
                {g.max_students != null && g.members_count != null && (
                  <div className="h-1 w-full rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/40 transition-all"
                      style={{
                        width: `${Math.min(100, Math.round(((g.members_count ?? 0) / g.max_students) * 100))}%`,
                      }}
                    />
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick links footer */}
      {!loading && groups.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest mb-3">
            After each class
          </p>
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            {[
              { step: "1", text: "Create homework assignment", href: "/teacher/homework", action: "Go" },
              { step: "2", text: "Check submission progress", href: "/teacher/homework/grading", action: "Open" },
              { step: "3", text: "Review and grade submissions", href: "/teacher/homework/grading", action: "Open" },
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
