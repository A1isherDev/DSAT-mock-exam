"use client";

import * as React from "react";
import { CheckCircle2, ImagePlus, Loader2, Save, X } from "lucide-react";

import { MathText } from "@/components/MathText";
import { FormulaToolbar } from "@/components/FormulaToolbar";
import { STUDIO_FIELD_LABEL, STUDIO_INPUT } from "@/components/studio/primitives";
import { normalizeApiError } from "@/lib/apiError";

import { useQbCreateQuestion, useQbDomains, useQbSkills, useQbUpdateQuestion } from "../hooks";
import { resolveImageUrl } from "../utils";
import type { QbImageFiles, QbClearImages, QbImageKey, QbQuestionDetail, QbWritePayload } from "../types";

const FIELD_LABEL = STUDIO_FIELD_LABEL;
const INPUT = STUDIO_INPUT;

const SUBJECTS = ["ENGLISH", "MATH"] as const;
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
const QUESTION_TYPES = [
  ["MULTIPLE_CHOICE", "Multiple choice"],
  ["STUDENT_PRODUCED", "Grid-in"],
  ["SHORT_TEXT", "Short text"],
  ["NUMERIC", "Numeric"],
  ["BOOLEAN", "True/False"],
] as const;

type Draft = {
  subject: string;
  question_type: string;
  difficulty: string;
  external_id: string;
  domain: number | "";
  skill: number | "";
  question_text: string;
  question_prompt: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation: string;
  points: number;
};

function toDraft(q?: QbQuestionDetail | null): Draft {
  return {
    subject: q?.subject ?? "ENGLISH",
    question_type: q?.question_type ?? "MULTIPLE_CHOICE",
    difficulty: q?.difficulty ?? "",
    external_id: q?.external_id ?? "",
    domain: q?.domain?.id ?? "",
    skill: q?.skill?.id ?? "",
    question_text: q?.question_text ?? "",
    question_prompt: q?.question_prompt ?? "",
    option_a: q?.option_a ?? "",
    option_b: q?.option_b ?? "",
    option_c: q?.option_c ?? "",
    option_d: q?.option_d ?? "",
    correct_answer: typeof q?.correct_answer === "string" ? q.correct_answer : q?.correct_answer ? JSON.stringify(q.correct_answer) : "",
    explanation: q?.explanation ?? "",
    points: q?.points ?? 1,
  };
}

const OPTION_LETTERS: Array<{ key: "a" | "b" | "c" | "d"; field: "option_a" | "option_b" | "option_c" | "option_d" }> = [
  { key: "a", field: "option_a" },
  { key: "b", field: "option_b" },
  { key: "c", field: "option_c" },
  { key: "d", field: "option_d" },
];

function ImageUploadField({
  imgKey,
  existingUrl,
  label,
  files,
  clears,
  setFiles,
  setClears,
}: {
  imgKey: QbImageKey;
  existingUrl?: string | null;
  label: string;
  files: QbImageFiles;
  clears: QbClearImages;
  setFiles: React.Dispatch<React.SetStateAction<QbImageFiles>>;
  setClears: React.Dispatch<React.SetStateAction<QbClearImages>>;
}) {
  const file = files[imgKey];
  const cleared = clears[imgKey];
  const url = resolveImageUrl(existingUrl);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {url && !cleared && !file ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="max-h-20 rounded-lg border border-border object-contain" />
          <button type="button" onClick={() => setClears((c) => ({ ...c, [imgKey]: true }))} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">
            <X className="h-3 w-3" /> Remove
          </button>
        </>
      ) : null}
      {file ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={URL.createObjectURL(file)} alt="Preview" className="max-h-20 rounded-lg border border-border object-contain" />
          <button type="button" onClick={() => setFiles((f) => { const n = { ...f }; delete n[imgKey]; return n; })} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-surface-2">
            <X className="h-3 w-3" /> Cancel
          </button>
        </>
      ) : null}
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border bg-surface-2/30 px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-surface-2/60">
        <ImagePlus className="h-3.5 w-3.5" />
        {file ? "Change" : url && !cleared ? "Replace" : "Add image"}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setFiles((prev) => ({ ...prev, [imgKey]: f }));
              setClears((c) => ({ ...c, [imgKey]: false }));
            }
          }}
        />
      </label>
    </div>
  );
}

export function BankQuestionEditor({
  existing,
  onSaved,
}: {
  existing?: QbQuestionDetail | null;
  onSaved: (q: QbQuestionDetail) => void;
}) {
  const isEdit = !!existing;
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(existing));
  const [imageFiles, setImageFiles] = React.useState<QbImageFiles>({});
  const [clearImages, setClearImages] = React.useState<QbClearImages>({});
  const [savedOk, setSavedOk] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDraft(toDraft(existing));
    setImageFiles({});
    setClearImages({});
    setSavedOk(false);
    setError(null);
  }, [existing]);

  const create = useQbCreateQuestion();
  const update = useQbUpdateQuestion();
  const busy = create.isPending || update.isPending;

  const { data: domains } = useQbDomains(draft.subject);
  const { data: skills } = useQbSkills(draft.domain ? { domain: Number(draft.domain) } : undefined);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const isMC = draft.question_type === "MULTIPLE_CHOICE" || draft.question_type === "BOOLEAN";

  // Formula insertion into whichever field is focused.
  const activeFieldRef = React.useRef<{ el: HTMLTextAreaElement | HTMLInputElement; setVal: (v: string) => void } | null>(null);
  const handleFormulaInsert = React.useCallback((snippet: string, cursorOffset: number) => {
    const active = activeFieldRef.current;
    if (!active) return;
    const { el, setVal } = active;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newVal = el.value.slice(0, start) + snippet + el.value.slice(end);
    setVal(newVal);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + cursorOffset, start + cursorOffset);
    });
  }, []);

  async function handleSave() {
    setError(null);
    setSavedOk(false);
    const payload: QbWritePayload = {
      subject: draft.subject,
      question_type: draft.question_type,
      difficulty: draft.difficulty || "",
      external_id: draft.external_id || "",
      domain: draft.domain === "" ? null : Number(draft.domain),
      skill: draft.skill === "" ? null : Number(draft.skill),
      question_text: draft.question_text,
      question_prompt: draft.question_prompt,
      option_a: draft.option_a,
      option_b: draft.option_b,
      option_c: draft.option_c,
      option_d: draft.option_d,
      correct_answer: draft.correct_answer,
      explanation: draft.explanation,
      points: draft.points,
    };
    try {
      const saved = isEdit
        ? await update.mutateAsync({ id: existing!.id, payload, files: imageFiles, clears: clearImages })
        : await create.mutateAsync({ payload, files: imageFiles, clears: clearImages });
      setSavedOk(true);
      setImageFiles({});
      setClearImages({});
      onSaved(saved);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      setError(normalizeApiError(e).message);
    }
  }

  const imgProps = (imgKey: QbImageKey, existingUrl: string | null | undefined, label: string) => ({
    imgKey,
    existingUrl,
    label,
    files: imageFiles,
    clears: clearImages,
    setFiles: setImageFiles,
    setClears: setClearImages,
  });

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-foreground">{isEdit ? `Edit ${existing!.qb_id}` : "New question"}</h2>
        <div className="flex items-center gap-2">
          {savedOk && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>
          )}
          <button type="button" disabled={busy} onClick={() => void handleSave()} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? "Save changes" : "Create"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div>}

      <FormulaToolbar onInsert={handleFormulaInsert} />

      {/* Taxonomy */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={FIELD_LABEL}>Subject</label>
          <select className={INPUT} value={draft.subject} onChange={(e) => patch({ subject: e.target.value, domain: "", skill: "" })}>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>Domain</label>
          <select className={INPUT} value={draft.domain} onChange={(e) => patch({ domain: e.target.value ? Number(e.target.value) : "", skill: "" })}>
            <option value="">— Unclassified —</option>
            {(domains ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>Skill</label>
          <select className={INPUT} value={draft.skill} disabled={!draft.domain} onChange={(e) => patch({ skill: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">— Unclassified —</option>
            {(skills ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={FIELD_LABEL}>Question type</label>
          <select className={INPUT} value={draft.question_type} onChange={(e) => patch({ question_type: e.target.value })}>
            {QUESTION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>Difficulty</label>
          <select className={INPUT} value={draft.difficulty} onChange={(e) => patch({ difficulty: e.target.value })}>
            <option value="">— None —</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>Points</label>
          <input type="number" min={1} className={INPUT} value={draft.points} onChange={(e) => patch({ points: Number(e.target.value) || 1 })} />
        </div>
      </div>

      {/* Stem */}
      <div>
        <label className={FIELD_LABEL}>Question text (stem)</label>
        <textarea
          className={`${INPUT} min-h-[120px] leading-relaxed`}
          value={draft.question_text}
          placeholder="LaTeX supported: \( x^2 + 1 = 0 \)"
          onChange={(e) => patch({ question_text: e.target.value })}
          onFocus={(e) => { activeFieldRef.current = { el: e.currentTarget, setVal: (v) => patch({ question_text: v }) }; }}
        />
        {draft.question_text.trim() && (
          <div className="mt-2 rounded-xl border border-border/60 bg-surface-2/50 px-3 py-2.5">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Preview</p>
            <MathText text={draft.question_text} className="text-sm leading-relaxed text-foreground" />
          </div>
        )}
        <div className="mt-3">
          <label className={FIELD_LABEL}>Question image (optional)</label>
          <ImageUploadField {...imgProps("question", existing?.question_image, "Question image")} />
        </div>
      </div>

      {/* Options */}
      {isMC && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface-2/30 p-4">
          <p className={FIELD_LABEL}>Answer choices</p>
          {OPTION_LETTERS.map(({ key, field }) => (
            <div key={key} className="space-y-1">
              <div className="flex items-start gap-3">
                <div className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-extrabold text-foreground">{key.toUpperCase()}</div>
                <input
                  className={`${INPUT} flex-1`}
                  placeholder={`Option ${key.toUpperCase()}`}
                  value={draft[field]}
                  onChange={(e) => patch({ [field]: e.target.value } as Partial<Draft>)}
                  onFocus={(e) => { activeFieldRef.current = { el: e.currentTarget, setVal: (v) => patch({ [field]: v } as Partial<Draft>) }; }}
                />
              </div>
              {draft[field].trim() && (
                <div className="ml-9 rounded-lg border border-border/50 bg-card px-2.5 py-1.5">
                  <MathText text={draft[field]} className="text-xs leading-relaxed text-foreground" />
                </div>
              )}
              <div className="ml-9">
                <ImageUploadField {...imgProps(key, existing?.[`option_${key}_image` as keyof QbQuestionDetail] as string | null, `Option ${key.toUpperCase()}`)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Correct answer + explanation */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={FIELD_LABEL}>Correct answer</label>
          <input className={INPUT} placeholder={isMC ? "A / B / C / D" : "e.g. 42 or 2/3, 0.667"} value={draft.correct_answer} onChange={(e) => patch({ correct_answer: e.target.value })} />
        </div>
        <div>
          <label className={FIELD_LABEL}>External ID (source)</label>
          <input className={INPUT} placeholder="optional" value={draft.external_id} onChange={(e) => patch({ external_id: e.target.value })} />
        </div>
      </div>
      <div>
        <label className={FIELD_LABEL}>Explanation / rationale</label>
        <textarea className={`${INPUT} min-h-[90px]`} value={draft.explanation} onChange={(e) => patch({ explanation: e.target.value })} onFocus={(e) => { activeFieldRef.current = { el: e.currentTarget, setVal: (v) => patch({ explanation: v }) }; }} />
      </div>
    </div>
  );
}
