"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAssessmentSetsList } from "@/features/assessments/hooks";
import { getRole, getSubject } from "@/lib/permissions";

const INPUT =
  "ui-input w-full rounded-xl border border-border bg-surface-2/80 px-3 py-2 text-sm shadow-sm";

export default function BuilderSetsPage() {
  // Backend already enforces teacher subject scoping.
  // For global staff (admin/test_admin/super_admin), default to "all subjects" to avoid
  // accidental disappearance of sets when a subject cookie is present.
  const role = getRole();
  const scopedSubject = role === "teacher" ? getSubject() : null;
  const [q, setQ] = useState("");
  const { data, isLoading, error, refetch } = useAssessmentSetsList(
    scopedSubject ? { subject: scopedSubject } : undefined,
  );

  const sets = Array.isArray(data) ? data : [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return sets;
    return sets.filter((x) => `${x.title} ${x.category} ${x.description}`.toLowerCase().includes(s));
  }, [q, sets]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-foreground">Assessment sets</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create sets and then build questions. Subject scope is enforced by backend.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/builder/sets/new"
            className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-extrabold hover:bg-primary/15"
          >
            New set
          </Link>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className={INPUT} />
        <p className="text-sm font-semibold text-muted-foreground">
          {isLoading ? "Loading…" : `${filtered.length} sets`}
        </p>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4">
          <p className="text-sm font-extrabold text-foreground">Failed to load</p>
          <p className="mt-1 text-sm text-muted-foreground">{String((error as any)?.message || error)}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2">
        {filtered.map((s) => (
          <Link
            key={s.id}
            href={`/builder/sets/${s.id}`}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-surface-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-extrabold text-foreground">#{s.id} · {s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.subject} · {s.category || "—"}</p>
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-label-foreground">
                {(s.questions || []).length} questions
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

