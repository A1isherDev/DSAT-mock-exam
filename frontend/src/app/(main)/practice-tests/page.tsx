"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { examsStudentApi } from "@/features/examsStudent/api";
import { FlaskConical, ChevronRight, BookOpen, Calculator } from "lucide-react";

type PracticeTestPackSection = {
  id: number;
  title: string;
  subject: string;
  module_count: number;
};

type PracticeTestPack = {
  id: number;
  title: string;
  description: string;
  is_published: boolean;
  sections: PracticeTestPackSection[];
  created_at: string;
};

function subjectLabel(subject: string): string {
  if (subject === "READING_WRITING") return "Reading & Writing";
  if (subject === "MATH") return "Mathematics";
  return subject;
}

export default function PracticeTestsListPage() {
  const [packs, setPacks] = useState<PracticeTestPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await examsStudentApi.getPracticeTestPacksStudent();
        if (!cancelled) setPacks(data as PracticeTestPack[]);
      } catch {
        if (!cancelled) setError("Could not load practice tests.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="font-bold text-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-foreground">Practice Tests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Custom practice tests — start any section in any order.
        </p>
      </div>

      {packs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <FlaskConical className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 font-bold text-foreground">No practice tests available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Practice test packs will appear here once they are published by your teacher.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {packs.map((pack) => (
            <Link
              key={pack.id}
              href={`/practice-tests/${pack.id}`}
              className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-extrabold text-foreground group-hover:text-primary transition-colors">
                    {pack.title || `Practice Test #${pack.id}`}
                  </h3>
                  {pack.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{pack.description}</p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {pack.sections.map((s) => {
                  const isRW = s.subject === "READING_WRITING";
                  return (
                    <span
                      key={s.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-bold ${
                        isRW
                          ? "bg-primary/10 text-primary"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {isRW ? <BookOpen className="h-3 w-3" /> : <Calculator className="h-3 w-3" />}
                      {subjectLabel(s.subject)}
                    </span>
                  );
                })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
