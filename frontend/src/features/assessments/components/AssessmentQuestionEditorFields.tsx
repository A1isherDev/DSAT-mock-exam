"use client";

import { useCallback, useMemo, useState } from "react";
import type { AssessmentChoice, AssessmentQuestionType } from "@/features/assessments/types";

export type AssessmentQuestionEditorDraft = {
  prompt: string;
  question_type: AssessmentQuestionType;
  order: number;
  points: number;
  is_active: boolean;
  choicesText: string;
  correctAnswerText: string;
  gradingConfigText: string;
};

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function defaultMcChoices(): AssessmentChoice[] {
  return ["A", "B", "C", "D"].map((id) => ({ id, text: "" }));
}

function parseChoices(text: string): AssessmentChoice[] {
  const raw = parseJson<unknown>(text, []);
  if (!Array.isArray(raw) || raw.length === 0) return defaultMcChoices();
  const out: AssessmentChoice[] = [];
  for (const row of raw) {
    if (row && typeof row === "object" && "id" in row) {
      const id = String((row as { id: unknown }).id || "").trim() || String.fromCharCode(65 + out.length);
      const t = String((row as { text?: unknown }).text ?? "");
      out.push({ id, text: t });
    }
  }
  return out.length ? out : defaultMcChoices();
}

type Props = {
  draft: AssessmentQuestionEditorDraft;
  onPatch: (p: Partial<AssessmentQuestionEditorDraft>) => void;
  inputClassName: string;
  disabled?: boolean;
  fieldLabelClass?: string;
};

export function AssessmentQuestionEditorFields({
  draft,
  onPatch,
  inputClassName,
  disabled,
  fieldLabelClass = "text-[11px] font-bold text-slate-500 uppercase tracking-widest",
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const choices = useMemo(() => parseChoices(draft.choicesText), [draft.choicesText]);

  const setChoices = useCallback(
    (next: AssessmentChoice[]) => {
      onPatch({ choicesText: JSON.stringify(next, null, 2) });
    },
    [onPatch],
  );

  const gradingObj = useMemo(() => parseJson<Record<string, unknown>>(draft.gradingConfigText, {}), [draft.gradingConfigText]);
  const toleranceRaw = gradingObj.tolerance;
  const toleranceStr =
    typeof toleranceRaw === "number" && Number.isFinite(toleranceRaw)
      ? String(toleranceRaw)
      : typeof toleranceRaw === "string"
        ? toleranceRaw
        : "";

  const setGradingPatch = (patch: Record<string, unknown>) => {
    const next = { ...gradingObj, ...patch };
    if (next.tolerance === "" || next.tolerance === null || typeof next.tolerance === "undefined") delete next.tolerance;
    onPatch({ gradingConfigText: JSON.stringify(next, null, 2) });
  };

  const correctMcId = useMemo(() => {
    const ca = parseJson<unknown>(draft.correctAnswerText, null);
    if (ca == null || ca === "") return "";
    const s = String(ca);
    return choices.some((c) => c.id === s) ? s : "";
  }, [draft.correctAnswerText, choices]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Question type</span>
          <select
            className={inputClassName}
            disabled={disabled}
            value={draft.question_type}
            onChange={(e) => {
              const t = e.target.value as AssessmentQuestionType;
              const patch: Partial<AssessmentQuestionEditorDraft> = { question_type: t };
              if (t === "multiple_choice") {
                patch.choicesText = JSON.stringify(defaultMcChoices(), null, 2);
                patch.correctAnswerText = JSON.stringify("A");
                patch.gradingConfigText = "{}";
              } else if (t === "numeric") {
                patch.choicesText = "[]";
                patch.correctAnswerText = JSON.stringify(0);
                patch.gradingConfigText = JSON.stringify({ tolerance: 0 }, null, 2);
              } else if (t === "boolean") {
                patch.choicesText = "[]";
                patch.correctAnswerText = JSON.stringify(true);
                patch.gradingConfigText = "{}";
              } else {
                patch.choicesText = "[]";
                patch.correctAnswerText = JSON.stringify("");
                patch.gradingConfigText = "{}";
              }
              onPatch(patch);
            }}
          >
            <option value="multiple_choice">Multiple choice</option>
            <option value="numeric">Numeric</option>
            <option value="short_text">Short text</option>
            <option value="boolean">True / False</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Order</span>
            <input
              className={inputClassName}
              disabled={disabled}
              type="number"
              value={String(draft.order)}
              onChange={(e) => onPatch({ order: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Points</span>
            <input
              className={inputClassName}
              disabled={disabled}
              type="number"
              min={1}
              value={String(draft.points)}
              onChange={(e) => onPatch({ points: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <span className={fieldLabelClass}>Active</span>
          <select
            className={inputClassName}
            disabled={disabled}
            value={String(draft.is_active)}
            onChange={(e) => onPatch({ is_active: e.target.value === "true" })}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className={fieldLabelClass}>Prompt / stem</span>
        <textarea
          className={`${inputClassName} min-h-[110px]`}
          disabled={disabled}
          value={draft.prompt}
          onChange={(e) => onPatch({ prompt: e.target.value })}
        />
      </div>

      {draft.question_type === "multiple_choice" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={fieldLabelClass}>Answer choices</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-50"
                disabled={disabled || choices.length >= 8}
                onClick={() => {
                  const nextLetter = String.fromCharCode(65 + choices.length);
                  setChoices([...choices, { id: nextLetter, text: "" }]);
                }}
              >
                Add choice
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-50"
                disabled={disabled || choices.length <= 2}
                onClick={() => setChoices(choices.slice(0, -1))}
              >
                Remove last
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            {choices.map((c, idx) => (
              <div key={`${c.id}-${idx}`} className="flex flex-wrap items-start gap-2 md:flex-nowrap">
                <input
                  className={`${inputClassName} w-14 shrink-0 font-mono text-xs`}
                  disabled={disabled}
                  value={c.id}
                  title="Choice id (A, B, …)"
                  onChange={(e) => {
                    const id = e.target.value.trim() || String.fromCharCode(65 + idx);
                    const next = choices.map((row, i) => (i === idx ? { ...row, id } : row));
                    setChoices(next);
                  }}
                />
                <input
                  className={`${inputClassName} flex-1 min-w-0`}
                  disabled={disabled}
                  placeholder={`Choice ${c.id} text`}
                  value={c.text}
                  onChange={(e) => {
                    const next = choices.map((row, i) => (i === idx ? { ...row, text: e.target.value } : row));
                    setChoices(next);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <span className={fieldLabelClass}>Correct choice</span>
            <select
              className={inputClassName}
              disabled={disabled}
              value={correctMcId}
              onChange={(e) => onPatch({ correctAnswerText: JSON.stringify(e.target.value) })}
            >
              <option value="">— Select —</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                  {c.text ? ` — ${c.text.slice(0, 80)}${c.text.length > 80 ? "…" : ""}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {draft.question_type === "numeric" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Correct value</span>
            <input
              className={inputClassName}
              disabled={disabled}
              type="text"
              inputMode="decimal"
              value={String(parseJson(draft.correctAnswerText, "") ?? "")}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") onPatch({ correctAnswerText: JSON.stringify(null) });
                else if (!Number.isNaN(Number(raw))) onPatch({ correctAnswerText: JSON.stringify(Number(raw)) });
                else onPatch({ correctAnswerText: JSON.stringify(raw) });
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Tolerance (±)</span>
            <input
              className={inputClassName}
              disabled={disabled}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={toleranceStr}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") {
                  const next = { ...gradingObj };
                  delete next.tolerance;
                  onPatch({ gradingConfigText: JSON.stringify(next, null, 2) });
                } else if (!Number.isNaN(Number(raw))) {
                  setGradingPatch({ tolerance: Number(raw) });
                }
              }}
            />
          </div>
        </div>
      ) : null}

      {draft.question_type === "boolean" ? (
        <div className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Correct answer</span>
          <select
            className={inputClassName}
            disabled={disabled}
            value={String(parseJson(draft.correctAnswerText, true))}
            onChange={(e) => onPatch({ correctAnswerText: JSON.stringify(e.target.value === "true") })}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </div>
      ) : null}

      {draft.question_type === "short_text" ? (
        <div className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Expected answer (exact match unless graders extend)</span>
          <input
            className={inputClassName}
            disabled={disabled}
            value={(() => {
              const ca = parseJson<unknown>(draft.correctAnswerText, "");
              if (typeof ca === "string") return ca;
              if (Array.isArray(ca) && ca.every((x) => typeof x === "string")) return (ca as string[]).join(", ");
              return ca == null ? "" : JSON.stringify(ca);
            })()}
            onChange={(e) => onPatch({ correctAnswerText: JSON.stringify(e.target.value) })}
          />
        </div>
      ) : null}

      <div className="pt-1">
        <button
          type="button"
          className="text-xs font-bold text-indigo-600 hover:underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide" : "Show"} advanced JSON (grading config, raw correct value, …)
        </button>
        {showAdvanced ? (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className={fieldLabelClass}>Choices JSON</span>
              <textarea
                className={`${inputClassName} min-h-[90px] font-mono text-xs`}
                disabled={disabled}
                value={draft.choicesText}
                onChange={(e) => onPatch({ choicesText: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={fieldLabelClass}>Correct answer JSON</span>
              <textarea
                className={`${inputClassName} min-h-[90px] font-mono text-xs`}
                disabled={disabled}
                value={draft.correctAnswerText}
                onChange={(e) => onPatch({ correctAnswerText: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className={fieldLabelClass}>Grading config JSON</span>
              <textarea
                className={`${inputClassName} min-h-[90px] font-mono text-xs`}
                disabled={disabled}
                value={draft.gradingConfigText}
                onChange={(e) => onPatch({ gradingConfigText: e.target.value })}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
