"use client";

import { Users } from "lucide-react";
import { OpsEmptyState } from "@/components/ops/ui";
import { cn } from "@/lib/cn";
import type { PersonSummary } from "@/components/ops/ClassroomOverviewPanel";

function displayName(p: PersonSummary): string {
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ");
  return full || p.email || "Unknown";
}

function PersonRow({ person }: { person: PersonSummary }) {
  const name = displayName(person);
  const sub = (person as PersonSummary & { subject?: string }).subject as string | undefined;
  const subjectColor =
    sub === "math"
      ? "bg-purple-100 text-purple-700"
      : sub === "english"
        ? "bg-teal-100 text-teal-700"
        : null;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-8 w-8 shrink-0 rounded-full bg-surface-2 flex items-center justify-center text-xs font-extrabold text-muted-foreground uppercase">
        {(name[0] ?? "?").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{name}</p>
        {name !== person.email && (
          <p className="text-xs text-muted-foreground truncate">{person.email}</p>
        )}
      </div>
      {subjectColor && sub && (
        <span
          className={cn(
            "shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            subjectColor,
          )}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function RosterGroup({
  label,
  people,
}: {
  label: string;
  people: PersonSummary[];
}) {
  if (people.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label} ({people.length})
      </p>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="divide-y divide-border">
          {people.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function StudentRosterSection({ people }: { people: PersonSummary[] }) {
  if (people.length === 0) {
    return <OpsEmptyState icon={Users} title="No members yet" />;
  }

  const teachers = people.filter((p) => p.role !== "STUDENT");
  const students = people.filter((p) => p.role === "STUDENT");

  return (
    <div className="space-y-5">
      <RosterGroup label="Teachers" people={teachers} />
      <RosterGroup label="Students" people={students} />
      {students.length === 0 && teachers.length > 0 && (
        <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
      )}
    </div>
  );
}
