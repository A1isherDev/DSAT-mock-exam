"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssessmentQuestionType } from "@/features/assessments/types";
import { ChoiceEditor, defaultMcChoices, parseAndNormalizeChoices } from "@/features/assessments/components/ChoiceEditor";

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
  // § 1.7 — persist advanced JSON panel preference across question switches
  // Namespaced key avoids collisions with other localStorage consumers.
  const ADV_KEY = "mastersat:builder:advanced_json_open";
  const [showAdvanced, setShowAdvanced] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(ADV_KEY) === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(ADV_KEY, String(showAdvanced)); } catch { /* ignore quota/private-mode */ }
  }, [showAdvanced]);
  // MC choices — parsed and normalised for ChoiceEditor
  const choices = useMemo(
    () => parseAndNormalizeChoices(draft.choicesText),
    [draft.choicesText],
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

  // Resolve correctMcId: prefer the stored value if it still matches a choice
  const correctMcId = useMemo(() => {
    const ca = parseJson<unknown>(draft.correctAnswerText, null);
    if (ca == null || ca === "") return choices[0]?.id ?? "A";
    const s = String(ca);
    return choices.some((c) => c.id === s) ? s : (choices[0]?.id ?? "A");
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
        <div className="rounded-xl border border-border bg-surface-2/30 p-3">
          <ChoiceEditor
            choices={choices}
            correctId={correctMcId}
            onChange={(nextChoices, nextCorrectId) => {
              onPatch({
                choicesText: JSON.stringify(nextChoices, null, 2),
                correctAnswerText: JSON.stringify(nextCorrectId),
              });
            }}
            disabled={disabled}
          />
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
