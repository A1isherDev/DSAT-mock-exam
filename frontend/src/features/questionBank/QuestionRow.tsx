"use client";

import { useMemo, useState } from "react";
import type { AdminCategory, AdminStandaloneQuestion } from "./types";
import AssignToModuleDialog from "./AssignToModuleDialog";

export default function QuestionRow(props: {
  q: AdminStandaloneQuestion;
  categories: AdminCategory[];
  onArchiveToggle: (questionId: number, nextActive: boolean) => Promise<void>;
  onAssign: (args: { testId: number; moduleId: number; questionId: number }) => Promise<{ status?: string } | void>;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const preview = useMemo(() => {
    const s = (props.q.question_text || "").trim();
    if (!s) return "(empty)";
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  }, [props.q.question_text]);

  const catLabel = useMemo(() => {
    const cid = (props.q as any).category as number | undefined;
    if (!cid) return "";
    const c = props.categories.find((x) => x.id === cid);
    if (!c) return `Category #${cid}`;
    return c.subject ? `[${c.subject}] ${c.name}` : c.name;
  }, [props.q, props.categories]);

  return (
    <div className="flex items-start justify-between gap-4 border-b py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-2 py-0.5">{props.q.question_type}</span>
          {props.q.is_active ? (
            <span className="rounded bg-green-50 px-2 py-0.5 text-green-700">Active</span>
          ) : (
            <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-800">Archived</span>
          )}
          {catLabel ? <span className="truncate">Category: {catLabel}</span> : <span>No category</span>}
          {typeof props.q.usage_count === "number" ? <span>Used in {props.q.usage_count} module(s)</span> : null}
        </div>

        <div className="mt-2 text-sm font-medium">{preview}</div>
        {props.q.question_prompt ? (
          <div className="mt-1 text-xs text-muted-foreground">
            Prompt: {(props.q.question_prompt || "").slice(0, 180)}
            {(props.q.question_prompt || "").length > 180 ? "…" : ""}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        <button className="rounded border px-3 py-1.5 text-sm" onClick={() => setAssignOpen(true)}>
          Assign
        </button>
        <button
          className="rounded border px-3 py-1.5 text-sm"
          onClick={async () => props.onArchiveToggle(props.q.id, !props.q.is_active)}
        >
          {props.q.is_active ? "Archive" : "Unarchive"}
        </button>
        <button className="rounded border px-3 py-1.5 text-sm" disabled title="Edit UI uses module editor for now">
          Edit
        </button>
      </div>

      <AssignToModuleDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        questionId={props.q.id}
        onAssign={async ({ testId, moduleId }) => props.onAssign({ testId, moduleId, questionId: props.q.id })}
      />
    </div>
  );
}

