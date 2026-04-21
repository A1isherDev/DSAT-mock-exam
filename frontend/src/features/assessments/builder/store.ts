import { create } from "zustand";
import type { AssessmentQuestion, AssessmentSet } from "@/features/assessments/types";
import { validateSetClientSide, type ValidationError } from "@/features/assessments/hooks";
import { normalizeQuestionList } from "@/features/assessments/builder/normalize";

const MAX_HISTORY = 50;

type BuilderDraft = {
  set: AssessmentSet | null;
  selectedQuestionId: number | null;
  setPatch: Partial<AssessmentSet>;
  questionPatches: Record<number, Partial<AssessmentQuestion>>;
  baseVersion: string | null;
};

export type BuilderDraftSnapshot = {
  setPatch: Partial<AssessmentSet>;
  questionPatches: Record<number, Partial<AssessmentQuestion>>;
  selectedQuestionId: number | null;
};

type BuilderState = BuilderDraft & {
  dirty: boolean;
  validation: ValidationError[];
  versionOutdated: boolean;
  past: BuilderDraftSnapshot[];
  future: BuilderDraftSnapshot[];

  hydrateFromServer: (set: AssessmentSet | null) => void;
  selectQuestion: (id: number | null) => void;
  patchSet: (patch: Partial<AssessmentSet>) => void;
  patchQuestion: (questionId: number, patch: Partial<AssessmentQuestion>) => void;
  removeQuestionPatch: (questionId: number) => void;
  resetDraft: () => void;
  recompute: () => void;
  markOutdated: (outdated: boolean) => void;

  pushUndoPoint: () => void;
  undo: () => void;
  redo: () => void;
  resetHistory: () => void;
};

function cloneSnapshot(s: BuilderDraftSnapshot): BuilderDraftSnapshot {
  return {
    setPatch: { ...s.setPatch },
    questionPatches: Object.fromEntries(
      Object.entries(s.questionPatches).map(([k, v]) => [Number(k), { ...(v || {}) }]),
    ),
    selectedQuestionId: s.selectedQuestionId,
  };
}

function snapshotFromState(s: BuilderDraft): BuilderDraftSnapshot {
  return cloneSnapshot({
    setPatch: s.setPatch,
    questionPatches: s.questionPatches,
    selectedQuestionId: s.selectedQuestionId,
  });
}

export function mergedSet(d: BuilderDraft): AssessmentSet | null {
  if (!d.set) return null;
  const base = d.set;
  const qs = Array.isArray(base.questions) ? base.questions : [];
  const mergedQuestions = qs.map((q) => ({ ...q, ...(d.questionPatches[q.id] || {}) }));
  const normalized = normalizeQuestionList(mergedQuestions as AssessmentQuestion[]);
  return { ...base, ...d.setPatch, questions: normalized };
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  set: null,
  selectedQuestionId: null,
  setPatch: {},
  questionPatches: {},
  baseVersion: null,

  dirty: false,
  validation: [],
  versionOutdated: false,
  past: [],
  future: [],

  resetHistory: () => set({ past: [], future: [] }),

  hydrateFromServer: (serverSet) => {
    set({
      set: serverSet,
      selectedQuestionId: null,
      setPatch: {},
      questionPatches: {},
      baseVersion: (serverSet as any)?.updated_at ? String((serverSet as any).updated_at) : null,
      versionOutdated: false,
      past: [],
      future: [],
    });
    get().recompute();
  },

  selectQuestion: (id) => set({ selectedQuestionId: id }),

  patchSet: (patch) => {
    set((s) => ({ setPatch: { ...s.setPatch, ...patch } }));
    get().recompute();
  },

  patchQuestion: (questionId, patch) => {
    set((s) => ({
      questionPatches: {
        ...s.questionPatches,
        [questionId]: { ...(s.questionPatches[questionId] || {}), ...patch },
      },
    }));
    get().recompute();
  },

  removeQuestionPatch: (questionId) => {
    set((s) => {
      const { [questionId]: _, ...rest } = s.questionPatches;
      return { questionPatches: rest };
    });
    get().recompute();
  },

  resetDraft: () => {
    set({ setPatch: {}, questionPatches: {}, versionOutdated: false, past: [], future: [] });
    get().recompute();
  },

  pushUndoPoint: () => {
    const s = get();
    const snap = snapshotFromState(s);
    set({
      past: [...s.past, snap].slice(-MAX_HISTORY),
      future: [],
    });
  },

  undo: () => {
    const s = get();
    if (!s.past.length) return;
    const current = snapshotFromState(s);
    const prev = s.past[s.past.length - 1]!;
    set({
      past: s.past.slice(0, -1),
      future: [current, ...s.future].slice(0, MAX_HISTORY),
      setPatch: { ...prev.setPatch },
      questionPatches: Object.fromEntries(Object.entries(prev.questionPatches).map(([k, v]) => [Number(k), { ...v }])),
      selectedQuestionId: prev.selectedQuestionId,
    });
    get().recompute();
  },

  redo: () => {
    const s = get();
    if (!s.future.length) return;
    const current = snapshotFromState(s);
    const next = s.future[0]!;
    set({
      future: s.future.slice(1),
      past: [...s.past, current].slice(-MAX_HISTORY),
      setPatch: { ...next.setPatch },
      questionPatches: Object.fromEntries(Object.entries(next.questionPatches).map(([k, v]) => [Number(k), { ...v }])),
      selectedQuestionId: next.selectedQuestionId,
    });
    get().recompute();
  },

  recompute: () => {
    const s = get();
    const view = mergedSet(s);
    const dirty =
      Object.keys(s.setPatch).length > 0 ||
      Object.keys(s.questionPatches).some((k) => Object.keys(s.questionPatches[Number(k)] || {}).length > 0);
    const validation = validateSetClientSide(view);
    set({ dirty, validation });
  },

  markOutdated: (outdated) => set({ versionOutdated: outdated }),
}));

export function useBuilderViewSet(): AssessmentSet | null {
  const s = useBuilderStore();
  return mergedSet(s);
}
