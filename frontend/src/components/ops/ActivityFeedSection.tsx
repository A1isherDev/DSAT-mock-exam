"use client";

import { useEffect, useState } from "react";
import { classesApi } from "@/lib/api";
import { Activity, FileText, Loader2 } from "lucide-react";
import { OpsEmptyState } from "@/components/ops/ui";

type StreamItem = {
  id: number;
  stream_type: string;
  content?: string;
  created_at: string;
  title?: string;
  author?: { first_name?: string; last_name?: string; email?: string } | null;
};

const STREAM_TYPE_LABELS: Record<string, string> = {
  post: "Post",
  assignment: "Assignment",
  submission: "Submission",
  graded: "Graded",
  returned: "Returned",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function authorName(item: StreamItem): string | null {
  if (!item.author) return null;
  return (
    [item.author.first_name, item.author.last_name].filter(Boolean).join(" ") ||
    item.author.email ||
    null
  );
}

export function ActivityFeedSection({ classroomId }: { classroomId: number }) {
  const [items, setItems] = useState<StreamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await classesApi.getStream(classroomId, { page_size: 30 });
        const arr: StreamItem[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : Array.isArray(data?.items)
              ? data.items
              : [];
        if (!cancelled) setItems(arr);
      } catch {
        if (!cancelled) setError("Could not load activity feed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return <OpsEmptyState icon={Activity} title="No activity yet" />;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="divide-y divide-border">
        {items.map((item) => {
          const typeLabel = STREAM_TYPE_LABELS[item.stream_type] ?? item.stream_type;
          const name = authorName(item);
          return (
            <div key={item.id} className="flex items-start gap-3 px-4 py-3.5">
              <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/60" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground rounded-lg bg-surface-2 px-1.5 py-0.5">
                    {typeLabel}
                  </span>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {item.title ?? item.content?.slice(0, 60) ?? "—"}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(item.created_at)}
                  {name ? ` · ${name}` : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
