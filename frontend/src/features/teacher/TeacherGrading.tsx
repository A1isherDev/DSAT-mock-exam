"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Paperclip, CheckCircle2, ClipboardPen, CornerDownLeft, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Card, CardContent, Badge, Button, Avatar, Textarea, Input, Field, EmptyState, Skeleton,
  ToastProvider, useToast,
} from "@/components/ui";
import { useGradingQueue, studentName, type QueueItem } from "./useGradingQueue";

function fmtWhen(iso?: string | null) {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TeacherGrading({ previewItems }: { previewItems?: QueueItem[] }) {
  return (
    <ToastProvider>
      <GradingInner previewItems={previewItems} />
    </ToastProvider>
  );
}

function GradingInner({ previewItems }: { previewItems?: QueueItem[] }) {
  const { status, items, loading, grade } = useGradingQueue(previewItems);
  const toast = useToast();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => items.find((i) => i.key === selectedKey) ?? null, [items, selectedKey]);

  useEffect(() => {
    if (!selectedKey && items.length > 0) setSelectedKey(items[0].key);
    if (selectedKey && !items.some((i) => i.key === selectedKey)) setSelectedKey(items[0]?.key ?? null);
  }, [items, selectedKey]);

  useEffect(() => {
    if (!selected) { setScore(""); setFeedback(""); return; }
    const r = selected.submission.review;
    setScore(r?.grade != null ? String(r.grade) : "");
    setFeedback(r?.feedback ?? "");
  }, [selected]);

  async function saveAndNext() {
    if (!selected) return;
    const n = Number(score);
    if (!Number.isFinite(n) || n < 0 || n > 100) { toast({ title: "Enter a score 0–100", tone: "warning" }); return; }
    const idx = items.findIndex((i) => i.key === selected.key);
    const nextKey = items[idx + 1]?.key ?? items[idx - 1]?.key ?? null;
    setSaving(true);
    const ok = await grade(selected, { grade: n, feedback });
    setSaving(false);
    if (ok) { toast({ title: `Graded ${studentName(selected.submission.student)}`, tone: "success" }); setSelectedKey(nextKey); }
    else toast({ title: "Couldn't save — try again", tone: "danger" });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void saveAndNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (status === "booting" || (loading && items.length === 0)) {
    return <div className="mx-auto max-w-6xl"><Skeleton className="mb-4 h-10 w-48" /><div className="grid gap-4 lg:grid-cols-[340px_1fr]"><Skeleton className="h-96 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div></div>;
  }
  if (status === "unauthenticated") {
    return <div className="mx-auto max-w-md py-16"><Card><CardContent className="py-10 text-center"><p className="ds-h3">Grading</p><p className="mt-2 text-sm text-muted-foreground">Sign in with a teacher account.</p></CardContent></Card></div>;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div><p className="ds-overline text-primary">Teacher</p><h1 className="ds-h1 mt-1">Grading</h1><p className="ds-small mt-1">{items.length} awaiting a grade · <kbd className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold">⌘↵</kbd> save &amp; next</p></div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="All caught up" description="No submissions are waiting to be graded right now." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          {/* Queue */}
          <div className="flex max-h-[72vh] flex-col gap-2 overflow-y-auto pr-1">
            {items.map((it) => {
              const active = it.key === selectedKey;
              return (
                <button key={it.key} type="button" onClick={() => setSelectedKey(it.key)} className={cn("ds-ring flex items-center gap-3 rounded-xl border p-3 text-left transition-colors", active ? "border-primary/30 bg-primary-soft" : "border-border bg-card hover:bg-surface-2")}>
                  <Avatar name={studentName(it.submission.student)} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{studentName(it.submission.student)}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{it.assignmentTitle} · {it.className}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-label-foreground">{fmtWhen(it.submission.submitted_at)}</span>
                </button>
              );
            })}
          </div>

          {/* Workspace */}
          {selected ? (
            <Card>
              <CardContent className="flex flex-col gap-5">
                <div className="flex items-center gap-3 border-b border-border pb-4">
                  <Avatar name={studentName(selected.submission.student)} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="ds-h4 truncate">{studentName(selected.submission.student)}</p>
                    <p className="truncate text-[13px] text-muted-foreground">{selected.assignmentTitle} · {selected.className}</p>
                  </div>
                  <Badge variant="info">Submitted {fmtWhen(selected.submission.submitted_at)}</Badge>
                </div>

                {/* Submission */}
                <div>
                  <p className="ds-overline mb-2">Submission</p>
                  {selected.submission.attempt ? (
                    <div className="mb-3 flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div className="flex-1"><p className="text-sm font-semibold text-foreground">{selected.submission.attempt.practice_test_title || "Practice attempt"}</p>{typeof selected.submission.attempt.score === "number" ? <p className="text-[12px] text-muted-foreground">Score {selected.submission.attempt.score}</p> : null}</div>
                    </div>
                  ) : null}
                  {selected.submission.files && selected.submission.files.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {selected.submission.files.map((f, i) => (
                        <li key={i}><a href={f.url} target="_blank" rel="noopener noreferrer" className="ds-ring flex items-center gap-2.5 rounded-xl border border-border p-3 text-sm transition-colors hover:bg-surface-2"><Paperclip className="h-4 w-4 text-muted-foreground" /><span className="min-w-0 flex-1 truncate font-medium text-foreground">{f.file_name || "Attachment"}</span><ExternalLink className="h-4 w-4 text-label-foreground" /></a></li>
                      ))}
                    </ul>
                  ) : !selected.submission.attempt ? (
                    <p className="text-sm text-muted-foreground">No files attached.</p>
                  ) : null}
                </div>

                {/* Grade form */}
                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <Field label="Score (0–100)" htmlFor="grade-score">
                    <Input id="grade-score" type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} placeholder="e.g. 85" className="max-w-[160px]" />
                  </Field>
                  <Field label="Feedback" htmlFor="grade-feedback">
                    <Textarea id="grade-feedback" rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What went well, what to work on…" />
                  </Field>
                  <div className="flex items-center gap-2">
                    <Button loading={saving} onClick={saveAndNext} leftIcon={<ClipboardPen />}>Save &amp; next</Button>
                    <span className="text-[12px] text-label-foreground"><CornerDownLeft className="mr-1 inline h-3.5 w-3.5" />⌘↵</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="flex h-full items-center justify-center py-16"><EmptyState compact icon={ClipboardPen} title="Select a submission" description="Choose from the queue to start grading." /></CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}
