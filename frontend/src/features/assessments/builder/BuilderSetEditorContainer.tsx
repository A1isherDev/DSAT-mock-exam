"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAssessmentSetDetail, useAssessmentSetsList, useDeleteAssessmentQuestion, useUpsertAssessmentQuestion, useUpsertAssessmentSet } from "@/features/assessments/hooks";
import { assessmentsAdminApi as assessmentAuthoringApi } from "@/features/assessmentsAdmin/api";
import { AssessmentCategorySelect } from "@/features/assessments/components/AssessmentCategorySelect";
import { AssessmentQuestionEditorFields } from "@/features/assessments/components/AssessmentQuestionEditorFields";
import type { AssessmentQuestion, AssessmentQuestionType, AssessmentSet } from "@/features/assessments/types";
import { normalizeApiError } from "@/lib/apiError";
import ErrorPanel from "@/components/ErrorPanel";
import { useToast } from "@/components/ToastProvider";
import { normalizeQuestionList } from "@/features/assessments/builder/normalize";
import { useBuilderStore, useBuilderViewSet } from "@/features/assessments/builder/store";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, Eye, Lock, Rocket } from "lucide-react";
import { cn } from "@/lib/cn";
import { StateTag } from "@/components/governance";

const INPUT =
  "ui-input w-full rounded-xl border border-border bg-surface-2/80 px-3 py-2 text-sm shadow-sm";

const TYPE_SHORT: Record<string, string> = {
  multiple_choice: "MC",
  numeric: "Num",
  short_text: "Text",
  boolean: "T/F",
};

// ─── SAT student preview ──────────────────────────────────────────────────────

function SATQuestionPreview({
  prompt,
  question_type,
  choicesText,
  correctAnswerText,
}: {
  prompt: string;
  question_type: string;
  choicesText: string;
  correctAnswerText: string;
}) {
  const choices = useMemo(() => {
    try {
      const parsed = JSON.parse(choicesText) as Array<{ id: string; text: string }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [choicesText]);

  const correctId = useMemo(() => {
    try {
      return JSON.parse(correctAnswerText) as string | null;
    } catch {
      return null;
    }
  }, [correctAnswerText]);

  if (!prompt.trim()) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-surface-2/30 py-10 text-sm text-muted-foreground">
        Enter a prompt to see the preview
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-4 py-2.5">
        <Eye className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
          Student preview
        </span>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm font-medium leading-relaxed text-foreground whitespace-pre-wrap">
          {prompt}
        </p>

        {question_type === "multiple_choice" && choices.length > 0 && (
          <div className="space-y-2">
            {choices.map((c, i) => {
              const letter = String.fromCharCode(65 + i);
              const isCorrect = c.id === correctId;
              return (
                <div
                  key={c.id ?? i}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                    isCorrect
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-border bg-surface-2/40 text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      isCorrect
                        ? "bg-emerald-500 text-white"
                        : "border border-border bg-background text-muted-foreground",
                    )}
                  >
                    {letter}
                  </span>
                  <span className="pt-0.5 text-sm leading-relaxed">
                    {c.text || <em className="opacity-40">empty</em>}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {question_type === "numeric" && (
          <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2.5 text-sm text-muted-foreground">
            Student enters a number
          </div>
        )}

        {question_type === "short_text" && (
          <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2.5 text-sm text-muted-foreground">
            Student types a short answer
          </div>
        )}

        {question_type === "boolean" && (
          <div className="flex gap-2">
            {[
              { label: "True", val: "true" },
              { label: "False", val: "false" },
            ].map(({ label, val }) => {
              let parsed: unknown = null;
              try { parsed = JSON.parse(correctAnswerText); } catch { /* ignore */ }
              const isCorrect =
                parsed === val ||
                (parsed === true && val === "true") ||
                (parsed === false && val === "false");
              return (
                <div
                  key={val}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2 text-center text-sm font-semibold",
                    isCorrect
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-border bg-surface-2/40 text-foreground",
                  )}
                >
                  {label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SortRow({
  q,
  active,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  q: AssessmentQuestion;
  active: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: q.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  // § 1.6 — inline delete confirmation (local state, no modal)
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startConfirm = () => {
    setConfirming(true);
    confirmTimer.current = setTimeout(() => setConfirming(false), 5000);
  };
  const cancelConfirm = () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirming(false);
  };
  const commitDelete = () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirming(false);
    onDelete();
  };
  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

  return (
    // § 1.5 — min-h-[64px] for visual rhythm across short/long questions
    <div
      ref={setNodeRef}
      style={style}
      className={`min-h-[64px] rounded-2xl border border-border p-3 shadow-sm ${active ? "bg-surface-2" : "bg-card"}`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Prompt is the primary label; metadata is secondary */}
        <button type="button" onClick={onSelect} className="min-w-0 text-left" title={q.prompt}>
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {q.prompt.trim() || <em className="text-muted-foreground/50">No prompt</em>}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {TYPE_SHORT[q.question_type] ?? q.question_type} · {q.points}pt · #{q.id}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-extrabold hover:bg-surface-2"
          >
            Duplicate
          </button>

          {/* § 1.6 — inline two-step delete: first click arms confirm, second commits */}
          {confirming ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={commitDelete}
                className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-extrabold text-red-700 hover:bg-red-100"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={cancelConfirm}
                className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-extrabold hover:bg-surface-2"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={startConfirm}
              className="rounded-lg border border-red-200 bg-card px-2 py-1 text-xs font-extrabold text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}

          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab rounded-lg border border-border bg-card px-2 py-1 text-xs font-extrabold hover:bg-surface-2 active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            Drag
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BuilderSetEditorContainer() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const setId = Number(id);
  const toast = useToast();

  const { data, isLoading, error, refetch } = useAssessmentSetsList();
  const detail = useAssessmentSetDetail(setId);
  const upsertSet = useUpsertAssessmentSet();
  const upsertQuestion = useUpsertAssessmentQuestion(setId);
  const delQuestion = useDeleteAssessmentQuestion(setId);

  const hydrate = useBuilderStore((s) => s.hydrateFromServer);
  const selectedQuestionId = useBuilderStore((s) => s.selectedQuestionId);
  const selectQuestion = useBuilderStore((s) => s.selectQuestion);
  const patchSet = useBuilderStore((s) => s.patchSet);
  const dirty = useBuilderStore((s) => s.dirty);
  const validation = useBuilderStore((s) => s.validation);
  const versionOutdated = useBuilderStore((s) => s.versionOutdated);
  const baseVersion = useBuilderStore((s) => s.baseVersion);
  const markOutdated = useBuilderStore((s) => s.markOutdated);
  const pushUndoPoint = useBuilderStore((s) => s.pushUndoPoint);
  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);
  const pastLen = useBuilderStore((s) => s.past.length);
  const futureLen = useBuilderStore((s) => s.future.length);
  const removeQuestionPatch = useBuilderStore((s) => s.removeQuestionPatch);

  const metaUndoArm = useRef(false);

  const patchSetTracked = (patch: Partial<AssessmentSet>) => {
    if (!metaUndoArm.current) {
      pushUndoPoint();
      metaUndoArm.current = true;
    }
    patchSet(patch);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable=true]")) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  // § 1.3 — warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      // Modern browsers display their own message; returnValue keeps legacy support.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const setRow = (detail.data as any) || null;

  // Guard: bad route param should never result in backend 404s like /sets/NaN/questions/.
  useEffect(() => {
    if (!Number.isFinite(setId) || setId <= 0) {
      toast.push({ tone: "error", message: "Invalid set id in the URL. Please re-open the set from the list." });
      void assessmentAuthoringApi.telemetry("stale_id_blocked_total");
    }
  }, [setId, toast]);

  const view = useBuilderViewSet();
  const questions = useMemo(() => {
    const qs = Array.isArray(view?.questions) ? (view!.questions as AssessmentQuestion[]) : [];
    return normalizeQuestionList(qs);
  }, [view]);

  const serverUpdatedAt = (setRow as any)?.updated_at;
  useEffect(() => {
    metaUndoArm.current = false;
  }, [setId, serverUpdatedAt]);

  // Hydrate store whenever server set changes (first load, refetch)
  useEffect(() => {
    if (!setRow) return;
    const nextVersion = (setRow as any)?.updated_at ? String((setRow as any).updated_at) : null;
    if (baseVersion && nextVersion && baseVersion !== nextVersion && dirty) {
      markOutdated(true);
      return;
    }
    hydrate(setRow);
  }, [setRow]); // intentionally only when server set instance changes

  // If the set disappeared (deleted / filtered / stale selection), recover instead of letting
  // later mutations hit 404 on a non-existent set id.
  useEffect(() => {
    if (detail.isLoading) return;
    if (!Number.isFinite(setId) || setId <= 0) return;
    if (!detail.data) return;
    if (setRow) return;
    toast.push({ tone: "error", message: "This set no longer exists or you no longer have access. Refreshing…" });
    void assessmentAuthoringApi.telemetry("builder_refetch_recovery_total");
    void detail.refetch();
  }, [detail, setId, setRow, toast]);

  // Validate selected question id against the current list; clear stale selection automatically.
  useEffect(() => {
    if (!selectedQuestionId) return;
    if (questions.some((q) => q.id === selectedQuestionId)) return;
    selectQuestion(null);
    void assessmentAuthoringApi.telemetry("invalid_selection_recovered_total");
  }, [questions, selectQuestion, selectedQuestionId]);

  // Auto-select from ?questionId= URL param (e.g. navigation from Question Bank → Edit)
  const autoSelectFired = useRef(false);
  useEffect(() => {
    if (autoSelectFired.current) return;
    if (questions.length === 0) return;
    const paramId = searchParams.get("questionId");
    if (!paramId) return;
    const qId = Number(paramId);
    if (!Number.isFinite(qId) || qId <= 0) return;
    if (!questions.some((q) => q.id === qId)) return;
    autoSelectFired.current = true;
    selectQuestion(qId);
  }, [questions, searchParams, selectQuestion]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const selected = useMemo(() => {
    return selectedQuestionId ? questions.find((q) => q.id === selectedQuestionId) ?? null : null;
  }, [questions, selectedQuestionId]);

  const [editing, setEditing] = useState<{
    questionId: number | null;
    prompt: string;
    question_type: string;
    order: number;
    points: number;
    is_active: boolean;
    choicesText: string;
    correctAnswerText: string;
    gradingConfigText: string;
  }>({
    questionId: null,
    prompt: "",
    question_type: "multiple_choice",
    order: 0,
    points: 1,
    is_active: true,
    choicesText: "[]",
    correctAnswerText: "null",
    gradingConfigText: "{}",
  });

  // keep local editor in sync with selection
  useEffect(() => {
    if (!selected) return;
    setEditing({
      questionId: selected.id,
      prompt: String(selected.prompt || ""),
      question_type: selected.question_type,
      order: Number(selected.order ?? 0),
      points: Number(selected.points ?? 1),
      is_active: Boolean(selected.is_active ?? true),
      choicesText: JSON.stringify((selected as any).choices ?? [], null, 2),
      correctAnswerText: JSON.stringify((selected as any).correct_answer ?? null, null, 2),
      gradingConfigText: JSON.stringify((selected as any).grading_config ?? {}, null, 2),
    });
  }, [selected?.id]);

  const parseJson = (s: string, fallback: any) => {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  };

  const saveQuestion = async () => {
    try {
      const payload: any = {
        order: Number(editing.order || 0),
        prompt: String(editing.prompt || "").trim(),
        question_type: editing.question_type,
        points: Number(editing.points || 1),
        is_active: Boolean(editing.is_active),
        choices: parseJson(editing.choicesText, []),
        correct_answer: parseJson(editing.correctAnswerText, null),
        grading_config: parseJson(editing.gradingConfigText, {}),
      };
      if (!payload.prompt) {
        toast.push({ tone: "error", message: "Prompt is required." });
        return;
      }
      if (payload.question_type === "multiple_choice") {
        const ids = new Set((payload.choices || []).map((c: { id?: unknown }) => String(c?.id ?? "").trim()).filter(Boolean));
        const ca = payload.correct_answer;
        const cStr = typeof ca === "string" ? ca : ca != null ? String(ca) : "";
        if (!cStr || !ids.has(cStr)) {
          toast.push({ tone: "error", message: "Multiple choice: pick a correct answer that matches a choice id." });
          return;
        }
      }
      const res = await upsertQuestion.mutateAsync({ id: editing.questionId, payload });
      toast.push({ tone: "success", message: "Question saved." });
      selectQuestion((res as any).id);
    } catch (e) {
      toast.push({ tone: "error", message: normalizeApiError(e).message });
    }
  };

  const newQuestion = () => {
    selectQuestion(null);
    setEditing({
      questionId: null,
      prompt: "",
      question_type: "multiple_choice",
      order: questions.length ? (questions[questions.length - 1].order ?? 0) + 1 : 0,
      points: 1,
      is_active: true,
      choicesText: JSON.stringify(
        ["A", "B", "C", "D"].map((id) => ({ id, text: "" })),
        null,
        2,
      ),
      correctAnswerText: JSON.stringify("A"),
      gradingConfigText: "{}",
    });
  };

  const duplicateQuestion = async (q: AssessmentQuestion) => {
    try {
      pushUndoPoint();
      await upsertQuestion.mutateAsync({
        id: null,
        payload: {
          order: questions.length,
          prompt: q.prompt,
          question_type: q.question_type,
          choices: (q as any).choices ?? [],
          correct_answer: (q as any).correct_answer ?? null,
          grading_config: (q as any).grading_config ?? {},
          points: q.points ?? 1,
          is_active: q.is_active ?? true,
        },
      });
      toast.push({ tone: "success", message: "Duplicated." });
    } catch (e) {
      toast.push({ tone: "error", message: normalizeApiError(e).message });
    }
  };

  const onDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = questions.map((q) => q.id);
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    const next = normalizeQuestionList(arrayMove(questions, oldIndex, newIndex));
    pushUndoPoint();
    try {
      for (let i = 0; i < next.length; i++) {
        const q = next[i];
        if (q.order !== i) {
          // eslint-disable-next-line no-await-in-loop
          await upsertQuestion.mutateAsync({ id: q.id, payload: { order: i } });
        }
      }
      toast.push({ tone: "success", message: "Reordered." });
    } catch (e) {
      toast.push({ tone: "error", message: normalizeApiError(e).message });
    }
  };

  const saveSetMeta = async () => {
    if (!view) return;
    try {
      await upsertSet.mutateAsync({ id: view.id, payload: { title: view.title, category: view.category, description: view.description } });
      toast.push({ tone: "success", message: "Set updated." });
    } catch (e) {
      toast.push({ tone: "error", message: normalizeApiError(e).message });
    }
  };

  if (isLoading && !view) return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">Loading…</div>;
  if (error) return <ErrorPanel title="Failed to load" message={String((error as any)?.message || error)} actionLabel="Retry" onAction={() => void refetch()} />;
  if (!view) return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">Set not found.</div>;

  const canPublish = validation.length === 0;
  const isPublished = Boolean((view as any)?.is_active);

  return (
    <>
      {/* § 4.3 — back-navigation breadcrumb */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href="/builder/sets"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          All sets
        </Link>
        <div className="flex items-center gap-2">
          <StateTag state={isPublished ? "PUBLISHED" : "DRAFT"} size="sm" />
          {!isPublished && canPublish && (
            <Link
              href={`/builder/sets/${view.id}/publish`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-700 transition-colors"
            >
              <Rocket className="h-3 w-3" />
              Publish
            </Link>
          )}
        </div>
      </div>

      {/* Immutability warning banner — shown when editing a published set */}
      {isPublished && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Lock className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-900">This set is published and immutable</p>
            <p className="text-sm text-amber-800 mt-0.5">
              Any changes you save here will create a new revision. Historical assignments already
              assigned to students reference the original published snapshot and are unaffected.
            </p>
          </div>
        </div>
      )}

      {/* § 1.1 — responsive grid: two-column from md, wider right panel at xl */}
      <div className="grid gap-4 md:grid-cols-[1fr_380px] xl:grid-cols-[1fr_440px]">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-ds-gold">Set</p>
            <p className="mt-1 text-xl font-extrabold tracking-tight text-foreground">
              #{view.id} · {view.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {view.subject} · {view.category || "—"} · {questions.length} questions · version {(view as any).updated_at || "—"}
            </p>
            {/* § 1.3 — visible dirty indicator */}
            {dirty ? (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                Unsaved changes
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={!pastLen || versionOutdated}
              onClick={() => undo()}
              className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-extrabold hover:bg-surface-2 disabled:opacity-40"
              title="Undo (⌘Z)"
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!futureLen || versionOutdated}
              onClick={() => redo()}
              className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-extrabold hover:bg-surface-2 disabled:opacity-40"
              title="Redo (⇧⌘Z)"
            >
              Redo
            </button>
            <button
              type="button"
              onClick={() => newQuestion()}
              className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-extrabold hover:bg-primary/15"
            >
              New question
            </button>
          </div>
        </div>

        {versionOutdated ? (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-sm font-extrabold text-foreground">Outdated version</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This set was updated elsewhere while you had local edits. Reload to get the latest version.
            </p>
            {/* § 1.4 — reload page button for non-actionable conflict state */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2"
              >
                Reload page
              </button>
              <button
                type="button"
                onClick={() => void refetch()}
                className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-surface-2"
              >
                Refetch only
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-label-foreground">Questions</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
              <div className="grid gap-2">
                {questions.map((q) => (
                  <SortRow
                    key={q.id}
                    q={q}
                    active={q.id === selectedQuestionId}
                    onSelect={() => selectQuestion(q.id)}
                    onDuplicate={() => void duplicateQuestion(q)}
                    onDelete={() =>
                      void (async () => {
                        pushUndoPoint();
                        try {
                          await delQuestion.mutateAsync(q.id);
                          removeQuestionPatch(q.id);
                          if (selectedQuestionId === q.id) selectQuestion(null);
                          toast.push({ tone: "success", message: "Deleted." });
                        } catch (e) {
                          toast.push({ tone: "error", message: normalizeApiError(e).message });
                        }
                      })()
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-label-foreground">Validation</p>
          {validation.length ? (
            <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">
              {validation.slice(0, 12).map((e, i) => (
                <li key={i}>
                  <span className="font-semibold">{e.scope}</span>
                  {e.id ? ` #${e.id}` : ""}: {e.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm font-semibold text-muted-foreground">All checks passed.</p>
          )}
          {/* Publish gateway */}
          {isPublished ? (
            <div className="mt-3 flex items-center gap-2">
              <StateTag state="PUBLISHED" size="sm" />
              <span className="text-xs text-muted-foreground">
                Set is live. Edits create a new revision automatically.
              </span>
            </div>
          ) : canPublish ? (
            <Link
              href={`/builder/sets/${view.id}/publish`}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-emerald-700 transition-colors"
            >
              <Rocket className="h-4 w-4" />
              Publish this set →
            </Link>
          ) : (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">
                Fix the validation issues above before publishing.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-extrabold uppercase tracking-wider text-label-foreground">
          {editing.questionId ? `Edit question #${editing.questionId}` : "Create question"}
        </p>

        <div className="mt-3 grid gap-3">
          <AssessmentQuestionEditorFields
            draft={{
              prompt: editing.prompt,
              question_type: editing.question_type as AssessmentQuestionType,
              order: editing.order,
              points: editing.points,
              is_active: editing.is_active,
              choicesText: editing.choicesText,
              correctAnswerText: editing.correctAnswerText,
              gradingConfigText: editing.gradingConfigText,
            }}
            onPatch={(p) => setEditing((e) => ({ ...e, ...p }))}
            inputClassName={INPUT}
            disabled={upsertQuestion.isPending || versionOutdated}
            fieldLabelClass="mb-1 text-xs font-bold uppercase tracking-wider text-label-foreground"
          />

          <button
            type="button"
            onClick={() => void saveQuestion()}
            disabled={upsertQuestion.isPending || versionOutdated}
            className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-extrabold hover:bg-primary/15 disabled:opacity-50"
          >
            {upsertQuestion.isPending ? "Saving…" : "Save question"}
          </button>
        </div>

        {/* Live SAT preview */}
        <div className="mt-5">
          <SATQuestionPreview
            prompt={editing.prompt}
            question_type={editing.question_type}
            choicesText={editing.choicesText}
            correctAnswerText={editing.correctAnswerText}
          />
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <p className="text-sm font-extrabold text-foreground">Set metadata</p>
          <div className="mt-3 grid gap-3">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-label-foreground">Title</p>
              <input className={INPUT} value={String(view.title || "")} onChange={(e) => patchSetTracked({ title: e.target.value })} />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-label-foreground">Category</p>
              <AssessmentCategorySelect
                subject={view.subject === "math" ? "math" : "english"}
                value={String(view.category || "")}
                onChange={(v) => patchSetTracked({ category: v })}
                className={INPUT}
                disabled={upsertSet.isPending || versionOutdated}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-label-foreground">Description</p>
              <textarea className={`${INPUT} min-h-[90px]`} value={String(view.description || "")} onChange={(e) => patchSetTracked({ description: e.target.value })} />
            </div>
            <button
              type="button"
              onClick={() => void saveSetMeta()}
              disabled={upsertSet.isPending || versionOutdated}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2 disabled:opacity-50"
            >
              {upsertSet.isPending ? "Saving…" : dirty ? "Save set (dirty)" : "Save set"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
