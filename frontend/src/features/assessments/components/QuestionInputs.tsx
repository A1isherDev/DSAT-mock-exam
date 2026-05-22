"use client";

import type { AssessmentChoice, AssessmentQuestionType } from "@/features/assessments/types";
import { MathText } from "@/components/MathText";
import { MinusCircle, Undo2 } from "lucide-react";

export function MultipleChoiceInput({
  choices,
  value,
  onChange,
  eliminated,
  onToggleElim,
}: {
  choices: AssessmentChoice[];
  value: string | null;
  onChange: (next: string | null) => void;
  eliminated?: Set<string>;
  onToggleElim?: (id: string) => void;
}) {
  const elim = eliminated ?? new Set<string>();
  return (
    <div className="grid gap-3">
      {choices.map((c) => {
        const checked = value === c.id;
        const isEliminated = elim.has(c.id);
        return (
          <div
            key={c.id}
            className={`group flex items-stretch gap-2 transition-opacity ${
              isEliminated ? "opacity-60" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (isEliminated) return;
                onChange(checked ? null : c.id);
              }}
              disabled={isEliminated}
              className={`select-none flex-1 min-h-[64px] rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                checked
                  ? "border-primary bg-primary/8 shadow-sm"
                  : "border-slate-200 bg-white hover:border-primary/50 hover:bg-slate-50"
              } ${isEliminated ? "cursor-not-allowed" : ""}`}
              aria-pressed={checked}
            >
              <div className="flex items-center gap-4">
                {/* SAT-style letter circle (A, B, C, D) */}
                <span
                  className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-extrabold transition-colors ${
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                  aria-hidden
                >
                  {c.id}
                </span>
                <div className="min-w-0 flex-1">
                  <MathText
                    text={c.text}
                    className={`text-base text-slate-900 leading-snug ${
                      isEliminated ? "line-through decoration-2 decoration-slate-500" : ""
                    }`}
                  />
                </div>
              </div>
            </button>

            {/* Eliminate / restore toggle */}
            {onToggleElim && (
              <button
                type="button"
                onClick={() => onToggleElim(c.id)}
                title={isEliminated ? `Bring back option ${c.id}` : `Cross out option ${c.id}`}
                aria-label={isEliminated ? "Restore option" : "Cross out option"}
                className={`shrink-0 w-11 rounded-2xl border-2 flex items-center justify-center transition-colors ${
                  isEliminated
                    ? "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                    : "border-transparent bg-transparent text-slate-400 hover:border-slate-300 hover:bg-white hover:text-slate-700"
                }`}
              >
                {isEliminated ? <Undo2 className="h-4 w-4" /> : <MinusCircle className="h-4 w-4" />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function NumericInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <input
      className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 min-h-[52px] text-base shadow-sm focus:border-primary focus:outline-none"
      type="text"
      inputMode="decimal"
      pattern="[0-9.-]*"
      value={value == null ? "" : String(value)}
      onChange={(e) => {
        const s = e.target.value.trim();
        if (!s) return onChange(null);
        const n = Number(s);
        if (!Number.isFinite(n)) return;
        onChange(n);
      }}
      placeholder="Enter a number…"
    />
  );
}

export function ShortTextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <textarea
      className="w-full min-h-[120px] rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base shadow-sm focus:border-primary focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your answer…"
    />
  );
}

export function AnswerInput({
  type,
  choices,
  value,
  onChange,
  eliminated,
  onToggleElim,
}: {
  type: AssessmentQuestionType;
  choices?: AssessmentChoice[];
  value: any;
  onChange: (next: any) => void;
  eliminated?: Set<string>;
  onToggleElim?: (id: string) => void;
}) {
  if (type === "multiple_choice") {
    return (
      <MultipleChoiceInput
        choices={choices || []}
        value={value ?? null}
        onChange={onChange}
        eliminated={eliminated}
        onToggleElim={onToggleElim}
      />
    );
  }
  if (type === "numeric") {
    return <NumericInput value={typeof value === "number" ? value : value == null ? null : Number(value)} onChange={onChange} />;
  }
  return <ShortTextInput value={String(value ?? "")} onChange={onChange} />;
}
