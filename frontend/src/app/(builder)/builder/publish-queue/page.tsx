"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { assessmentsAdminApi } from "@/features/assessmentsAdmin/api";
import type { AssessmentSet } from "@/features/assessments/types";
import { SendHorizonal, CheckCircle2, Clock, AlertTriangle, ArrowRight } from "lucide-react";

type PublishCandidate = {
  set: AssessmentSet;
  activeQuestions: number;
  inactiveQuestions: number;
  totalQuestions: number;
  readyToPublish: boolean;
  issues: string[];
};

function analyzeSet(set: AssessmentSet): PublishCandidate {
  const qs = set.questions ?? [];
  const active = qs.filter((q) => q.is_active).length;
  const inactive = qs.length - active;

  const issues: string[] = [];
  if (qs.length === 0) issues.push("No questions");
  if (active === 0 && qs.length > 0) issues.push("No active questions");
  if (!set.title?.trim()) issues.push("Missing title");
  if (!set.category?.trim()) issues.push("No category assigned");

  return {
    set,
    activeQuestions: active,
    inactiveQuestions: inactive,
    totalQuestions: qs.length,
    readyToPublish: issues.length === 0,
    issues,
  };
}

export default function PublishQueuePage() {
  const [sets, setSets] = useState<AssessmentSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await assessmentsAdminApi.listSets({ limit: 200 });
        if (!cancelled) setSets(data.results);
      } catch {
        if (!cancelled) setError("Could not load assessment sets.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const candidates = useMemo<PublishCandidate[]>(
    () =>
      sets
        .filter((s) => !s.is_active) // DRAFT sets only
        .map(analyzeSet)
        .sort((a, b) => {
          // Ready ones first, then by name
          if (a.readyToPublish !== b.readyToPublish) return a.readyToPublish ? -1 : 1;
          return a.set.title.localeCompare(b.set.title);
        }),
    [sets],
  );

  const readyCount = candidates.filter((c) => c.readyToPublish).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">
          Questions console
        </p>
        <h1 className="text-xl font-bold text-foreground tracking-tight">Publish Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft assessment sets awaiting review and publication. Publishing creates an immutable
          snapshot that can be assigned to classrooms.
        </p>
      </div>

      {/* Snapshot architecture note */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 shrink-0">
            <SendHorizonal className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Immutable publish pipeline</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Once published, the question snapshot is locked. Students who attempt the assessment
              always see the exact questions from the published version — even if questions are
              later revised. This guarantees academic integrity.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Full snapshot versioning (AssessmentSetVersion records, checksum verification,
              superseding) is being deployed. Currently, publishing sets{" "}
              <code className="font-mono bg-surface-2 px-1 rounded">is_active = true</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Candidates list */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between gap-2">
          <p className="font-bold text-foreground">
            {loading ? "Loading…" : `${candidates.length} draft set${candidates.length === 1 ? "" : "s"}`}
          </p>
          {!loading && readyCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {readyCount} ready to publish
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-emerald-500" />
            <p className="font-semibold text-foreground">Queue is empty</p>
            <p className="text-sm mt-1">All assessment sets are published.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {candidates.map((c) => (
              <div key={c.set.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-extrabold text-foreground truncate">{c.set.title}</p>
                    {c.set.subject && (
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${c.set.subject === "math" ? "bg-purple-100 text-purple-800" : "bg-teal-100 text-teal-800"}`}
                      >
                        {c.set.subject}
                      </span>
                    )}
                    {c.set.category && (
                      <span className="text-xs text-muted-foreground">· {c.set.category}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {c.totalQuestions} question{c.totalQuestions === 1 ? "" : "s"}
                    </span>
                    {c.activeQuestions > 0 && (
                      <span className="text-emerald-700 font-semibold">
                        {c.activeQuestions} active
                      </span>
                    )}
                    {c.inactiveQuestions > 0 && (
                      <span className="text-amber-700 font-semibold">
                        {c.inactiveQuestions} inactive
                      </span>
                    )}
                  </div>

                  {/* Issues */}
                  {c.issues.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {c.issues.map((issue) => (
                        <span
                          key={issue}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {issue}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {c.readyToPublish ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                      <Clock className="h-3.5 w-3.5" />
                      Needs attention
                    </span>
                  )}
                  <Link
                    href={`/builder/sets/${c.set.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-surface-2 transition-colors"
                  >
                    Open editor
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
