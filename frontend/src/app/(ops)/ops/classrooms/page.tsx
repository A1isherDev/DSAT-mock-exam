"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import type { Classroom } from "@/lib/criticalApiContract";
import { Search, School, Plus, RefreshCw, Users, BookOpen, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

type ClassroomWithRole = Classroom & { my_role?: string; subject?: string; student_count?: number };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Teacher",
  CO_TEACHER: "Co-teacher",
  STUDENT: "Student",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-primary/10 text-primary",
  CO_TEACHER: "bg-teal-100 text-teal-800",
  STUDENT: "bg-blue-100 text-blue-800",
};

export default function OpsClassroomsPage() {
  const [classrooms, setClassrooms] = useState<ClassroomWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "ADMIN" | "STUDENT">("all");

  const loadClassrooms = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await classesApi.list();
      setClassrooms(data.items as ClassroomWithRole[]);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Could not load classrooms.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassrooms();
  }, []);

  const filtered = useMemo(() => {
    let result = classrooms;
    if (search.trim().length >= 2) {
      const term = search.toLowerCase();
      result = result.filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(term) ||
          (c.subject ?? "").toLowerCase().includes(term),
      );
    }
    if (roleFilter !== "all") {
      result = result.filter((c) => c.my_role === roleFilter);
    }
    return result;
  }, [classrooms, search, roleFilter]);

  const managedCount = classrooms.filter((c) => c.my_role === "ADMIN").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">
            Admin console · Classrooms
          </p>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Classroom management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All classrooms you have access to. Classrooms with the Teacher role allow assignment
            creation and student management.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadClassrooms}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-2xl font-extrabold text-foreground tabular-nums">{classrooms.length}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">Total classrooms</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-2xl font-extrabold text-primary tabular-nums">{managedCount}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">As teacher</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-2xl font-extrabold text-foreground tabular-nums">
              {classrooms.length - managedCount}
            </p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">As student / other</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search classrooms…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2 text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold"
        >
          <option value="all">All roles</option>
          <option value="ADMIN">My classrooms (Teacher)</option>
          <option value="STUDENT">Enrolled (Student)</option>
        </select>
      </div>

      {/* Classrooms list */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 font-bold text-foreground">
          {loading ? "Loading…" : `${filtered.length} classroom${filtered.length === 1 ? "" : "s"}`}
        </div>

        {loading ? (
          <div className="flex justify-center p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <School className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">
              {classrooms.length === 0 ? "No classrooms found." : "No classrooms match your filters."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((c) => {
              const roleLabel = c.my_role ? ROLE_LABELS[c.my_role] ?? c.my_role : null;
              const roleColor = c.my_role ? ROLE_COLORS[c.my_role] ?? "bg-slate-100 text-slate-700" : "";
              return (
                <div
                  key={c.id}
                  className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-surface-2/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="rounded-xl bg-surface-2 p-2.5 shrink-0">
                      <School className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <p className="font-extrabold text-foreground truncate">{c.name}</p>
                        {roleLabel && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
                              roleColor,
                            )}
                          >
                            {roleLabel}
                          </span>
                        )}
                        {c.subject && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
                              c.subject.toLowerCase().includes("math")
                                ? "bg-purple-100 text-purple-800"
                                : "bg-teal-100 text-teal-800",
                            )}
                          >
                            {c.subject}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>ID #{c.id}</span>
                        {c.student_count != null && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {c.student_count} students
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {c.my_role === "ADMIN" && (
                      <Link
                        href={`/ops/assignments?classroomId=${c.id}`}
                        className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-surface-2 transition-colors"
                      >
                        <BookOpen className="h-3 w-3" />
                        Assignments
                      </Link>
                    )}
                    <Link
                      href={`/classes/${c.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-surface-2 transition-colors"
                    >
                      View
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
