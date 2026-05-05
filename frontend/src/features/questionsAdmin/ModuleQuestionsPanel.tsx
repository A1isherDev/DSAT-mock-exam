"use client";

import * as React from "react";
import Link from "next/link";
import {
  useCreateModuleQuestion,
  useModuleQuestionsQuery,
  useReorderModuleQuestion,
} from "@/features/questionsAdmin/hooks";
import type { AdminModuleQuestion } from "@/features/questionsAdmin/types";
import { normalizeApiError } from "@/lib/apiError";

function QuestionRow(props: {
  q: AdminModuleQuestion;
  index: number;
  total: number;
  testId: number;
  moduleId: number;
  actionsDisabled: boolean;
  onMove: (questionId: number, action: "up" | "down") => void;
}) {
  const { q, index, total, testId, moduleId, actionsDisabled, onMove } = props;
  const atFirst = index <= 0;
  const atLast = index >= total - 1;

  return (
    <tr className="border-b border-border">
      <td className="px-2 py-2 align-top text-sm tabular-nums">{q.order}</td>
      <td className="px-2 py-2 align-top text-sm">{q.question_text || "—"}</td>
      <td className="px-2 py-2 align-top text-xs text-muted-foreground">{q.question_type}</td>
      <td className="px-2 py-2 align-top">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            disabled={actionsDisabled || atFirst}
            onClick={() => onMove(q.id, "up")}
            className="rounded border border-border bg-card px-2 py-1 text-xs font-semibold disabled:opacity-40"
          >
            Move up
          </button>
          <button
            type="button"
            disabled={actionsDisabled || atLast}
            onClick={() => onMove(q.id, "down")}
            className="rounded border border-border bg-card px-2 py-1 text-xs font-semibold disabled:opacity-40"
          >
            Move down
          </button>
          <Link
            href={`/questions/tests/${testId}/modules/${moduleId}?questionId=${q.id}`}
            className="inline-flex items-center rounded border border-border bg-card px-2 py-1 text-xs font-semibold hover:bg-surface-2"
          >
            Edit
          </Link>
        </div>
      </td>
    </tr>
  );
}

export default function ModuleQuestionsPanel(props: { testId: number; moduleId: number }) {
  const { testId, moduleId } = props;
  const { data: questions = [], isLoading, isError, error, refetch, isFetching } = useModuleQuestionsQuery(
    testId,
    moduleId,
  );
  const create = useCreateModuleQuestion(testId, moduleId);
  const reorder = useReorderModuleQuestion(testId, moduleId);

  const move = React.useCallback(
    (questionId: number, action: "up" | "down") => {
      reorder.mutate({ questionId, action });
    },
    [reorder],
  );

  const listFailed = isError && error;
  const listErrMsg = listFailed ? normalizeApiError(error).message : null;
  const reorderErrMsg =
    reorder.isError && reorder.error ? normalizeApiError(reorder.error).message : null;
  const createErrMsg =
    create.isError && create.error ? normalizeApiError(create.error).message : null;

  const mutationBusy = reorder.isPending || create.isPending;
  const actionsDisabled = mutationBusy;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">Module questions</h1>
          <p className="text-sm text-muted-foreground">
            Practice test #{testId} · Module #{moduleId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching && !isLoading}
            className="rounded border border-border px-3 py-1.5 text-sm font-semibold hover:bg-surface-2 disabled:opacity-40"
          >
            {isFetching ? "Refreshing…" : "Retry / refresh"}
          </button>
        </div>
      </div>

      {listErrMsg ? (
        <div className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-semibold text-destructive">Could not load questions</p>
          <p className="mt-1 text-muted-foreground">{listErrMsg}</p>
          <button
            type="button"
            className="mt-2 rounded border border-border px-3 py-1 text-xs font-semibold hover:bg-surface-2"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {reorderErrMsg ? (
        <p className="mt-2 text-sm text-destructive">Reorder failed: {reorderErrMsg}</p>
      ) : null}
      {createErrMsg ? (
        <p className="mt-2 text-sm text-destructive">Could not add question: {createErrMsg}</p>
      ) : null}

      {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : null}

      {!isLoading && !listFailed ? (
        <>
          {questions.length === 0 ? (
            <div className="mt-6 rounded border border-dashed border-border p-6 text-center">
              <p className="text-sm font-semibold text-foreground">No questions in this module yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">Add a question to get started.</p>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => create.mutate()}
                className="mt-4 rounded border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold hover:bg-primary/15 disabled:opacity-40"
              >
                {create.isPending ? "Adding…" : "Add question"}
              </button>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  disabled={actionsDisabled}
                  onClick={() => create.mutate()}
                  className="rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-semibold hover:bg-primary/15 disabled:opacity-40"
                >
                  {create.isPending ? "Adding…" : "Add question"}
                </button>
              </div>
              <table className="w-full min-w-[480px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2 font-semibold">Order</th>
                    <th className="px-2 py-2 font-semibold">Text</th>
                    <th className="px-2 py-2 font-semibold">Type</th>
                    <th className="px-2 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q, i) => (
                    <QuestionRow
                      key={q.id}
                      q={q}
                      index={i}
                      total={questions.length}
                      testId={testId}
                      moduleId={moduleId}
                      actionsDisabled={actionsDisabled}
                      onMove={move}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
