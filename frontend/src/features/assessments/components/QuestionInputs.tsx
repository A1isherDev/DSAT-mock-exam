"use client";

import type { AssessmentChoice, AssessmentQuestionType } from "@/features/assessments/types";

export function MultipleChoiceInput({
  choices,
  value,
  onChange,
}: {
  choices: AssessmentChoice[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <div className="grid gap-2">
      {choices.map((c) => {
        const checked = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(checked ? null : c.id)}
            className={`rounded-2xl border border-border p-4 text-left shadow-sm transition-colors hover:bg-surface-2 ${
              checked ? "bg-surface-2" : "bg-card"
            }`}
          >
            <p className="text-xs font-extrabold uppercase tracking-wider text-label-foreground">{c.id}</p>
            <p className="mt-1 text-sm text-foreground">{c.text}</p>
          </button>
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
      className="ui-input w-full rounded-xl border border-border bg-surface-2/80 px-3 py-2 text-sm shadow-sm"
      inputMode="decimal"
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
      className="ui-input w-full min-h-[120px] rounded-xl border border-border bg-surface-2/80 px-3 py-2 text-sm shadow-sm"
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
}: {
  type: AssessmentQuestionType;
  choices?: AssessmentChoice[];
  value: any;
  onChange: (next: any) => void;
}) {
  if (type === "multiple_choice") {
    return <MultipleChoiceInput choices={choices || []} value={value ?? null} onChange={onChange} />;
  }
  if (type === "numeric") {
    return <NumericInput value={typeof value === "number" ? value : value == null ? null : Number(value)} onChange={onChange} />;
  }
  return <ShortTextInput value={String(value ?? "")} onChange={onChange} />;
}

