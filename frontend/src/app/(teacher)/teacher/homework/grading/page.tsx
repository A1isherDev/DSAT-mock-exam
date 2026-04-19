"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import { Calendar, ChevronRight, ClipboardCheck } from "lucide-react";

type Row = {
  id: number;
  title: string;
  due_at?: string | null;
  submissions_count?: number;
  classroom_id: number;
  classroom_name: string;
  subject?: string;
};

export default function TeacherHomeworkGradingHubPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await classesApi.list();
        const groups = (Array.isArray(all) ? all : []).filter((g) => g.my_role === "ADMIN");
        const out: Row[] = [];
        for (const g of groups) {
          const list = await classesApi.listAssignments(g.id);
          const arr = Array.isArray(list) ? list : [];
          for (const a of arr) {
            out.push({
              id: Number(a.id),
              title: String(a.title || "Untitled"),
              due_at: a.due_at ?? null,
              submissions_count: typeof a.submissions_count === "number" ? a.submissions_count : undefined,
              classroom_id: g.id,
              classroom_name: g.name || `Class #${g.id}`,
              subject: g.subject,
            });
          }
        }
        out.sort((x, y) => {
          const tx = x.due_at ? new Date(x.due_at).getTime() : 0;
          const ty = y.due_at ? new Date(y.due_at).getTime() : 0;
          return ty - tx;
        });
        if (!cancelled) setRows(out);
      } catch (e: unknown) {
        const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        if (!cancelled) setError(typeof d === "string" ? d : "Could not load homework.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatDue = (s?: string | null) => {
    if (!s) return "No deadline";
    try {
      return new Date(s).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return s;
    }
  };

  const empty = useMemo(() => rows.length === 0 && !loading && !error, [rows.length, loading, error]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-primary">Grading</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Grade homework</h1>
        <p className="mt-2 text-muted-foreground">
          Open an assignment to see who turned work in, review uploads and pastpaper results, and enter grades.
        </p>
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-border bg-card p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-muted-foreground">
          No assignments in your groups yet. Create homework from{" "}
          <Link href="/teacher/homework" className="font-semibold text-primary underline">
            Homework management
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4 font-bold text-foreground">All homework</div>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={`${r.classroom_id}-${r.id}`}>
                <Link
                  href={`/teacher/homework/grading/${r.classroom_id}/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-foreground">{r.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground/90">{r.classroom_name}</span>
                      {r.subject ? <span> · {r.subject}</span> : null}
                    </p>
                    <p className="mt-1 inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDue(r.due_at)}
                      </span>
                      {typeof r.submissions_count === "number" ? (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          {r.submissions_count} submission{r.submissions_count === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/teacher/homework" className="font-semibold text-primary hover:underline">
          ← Back to homework management
        </Link>
      </p>
    </div>
  );
}
