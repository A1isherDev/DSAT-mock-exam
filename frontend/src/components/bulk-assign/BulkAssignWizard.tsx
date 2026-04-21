"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Layers,
  ListChecks,
  Loader2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { adminApi } from "@/lib/api";
import {
  formatMockExamAdminLabel,
  formatPastpaperPackAdminLabel,
  pastpaperSectionSummary,
} from "@/lib/adminAssignFormat";
import { AssessmentClassroomAssignPanel } from "./AssessmentClassroomAssignPanel";
import { AssignmentHistoryPanel } from "./AssignmentHistoryPanel";
import { SearchableSelect, type SearchableOption } from "./SearchableSelect";
import type {
  AssignmentDispatchRow,
  BulkAssignKind,
  BulkAssignUserRow,
  LastAssignResult,
  PastpaperScope,
} from "./types";
import {
  accountStatusLabel,
  isStudentRole,
  matchesClassroomFilter,
  matchesSubjectTrackFilter,
  mockRowEligibility,
  pastpaperRowEligibility,
  type EligibilityRow,
  platformSubjectsForMockAssignment,
  platformSubjectsInResolvedPastpaper,
  resolvePastpaperSectionIdsForPack,
  studentDisplayName,
} from "./subjectEligibility";

type TrackFilter = "ALL" | "MATH" | "ENGLISH";

function mapAssignApiToLastResult(res: Record<string, unknown>, ok: boolean, message?: string): LastAssignResult {
  const skipped = Array.isArray(res?.skipped_users) ? (res.skipped_users as LastAssignResult["skipped_users"]) : [];
  return {
    ok,
    message,
    dispatch_id: typeof res?.dispatch_id === "number" ? res.dispatch_id : Number(res?.dispatch_id) || undefined,
    dispatch_status: typeof res?.dispatch_status === "string" ? res.dispatch_status : undefined,
    students_granted_count:
      typeof res?.students_granted_count === "number" ? res.students_granted_count : undefined,
    students_requested_count:
      typeof res?.students_requested_count === "number" ? res.students_requested_count : undefined,
    students_skipped_count:
      typeof res?.students_skipped_count === "number" ? res.students_skipped_count : undefined,
    tests_added: typeof res?.tests_added === "number" ? res.tests_added : undefined,
    skipped_users: skipped,
  };
}

function studentInClassroom(u: BulkAssignUserRow, classroomId: number): boolean {
  return (u.bulk_assign_profile?.classrooms || []).some((c) => c.id === classroomId);
}

const BTN_PRIMARY =
  "btn-primary text-sm !px-4 !py-2.5 inline-flex items-center gap-2 justify-center font-bold disabled:opacity-50";
const BTN_GHOST = "btn-secondary text-sm !px-4 !py-2.5 font-semibold";
const INPUT = "input-modern";

const STEP_META = [
  { id: 1, title: "Assignment type", hint: "Pastpaper library or timed mock" },
  { id: 2, title: "Content", hint: "Pick one exam or card" },
  { id: 3, title: "Students", hint: "Filter, review access, multi-select" },
  { id: 4, title: "Configuration", hint: "Sections and form filter (persisted with dispatch)" },
  { id: 5, title: "Review", hint: "Confirm and grant access" },
] as const;

export type BulkAssignWizardProps = {
  canAssign: boolean;
  users: BulkAssignUserRow[];
  mockExams: Array<Record<string, unknown>>;
  pastpaperPacks: Array<Record<string, unknown>>;
  loadingUsers?: boolean;
  showToast: (msg: string) => void;
  onAfterSuccess: () => void | Promise<void>;
  intent: "pastpapers" | "mocks" | null;
  onConsumeIntent: () => void;
  defaultPastpaperScope: PastpaperScope;
};

function inferPastpaperFromSectionIds(
  sectionIds: number[],
  packs: Array<{ id: number; sections?: Array<{ id: number; subject: string }> }>,
): { packId: number; scope: PastpaperScope } | null {
  if (!sectionIds.length) return null;
  const want = new Set(sectionIds);
  for (const p of packs) {
    const sections = p.sections || [];
    const byId = new Map(sections.map((s) => [s.id, s]));
    if (![...want].every((id) => byId.has(id))) continue;
    const subs = new Set(sectionIds.map((id) => byId.get(id)?.subject).filter(Boolean) as string[]);
    let scope: PastpaperScope = "BOTH";
    if (subs.size === 1) {
      scope = subs.has("MATH") ? "MATH" : "READING_WRITING";
    }
    return { packId: Number(p.id), scope };
  }
  return null;
}

export function BulkAssignWizard({
  canAssign,
  users,
  mockExams,
  pastpaperPacks,
  loadingUsers,
  showToast,
  onAfterSuccess,
  intent,
  onConsumeIntent,
  defaultPastpaperScope,
}: BulkAssignWizardProps) {
  const [history, setHistory] = useState<AssignmentDispatchRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [rerunBusyId, setRerunBusyId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<LastAssignResult | null>(null);

  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<BulkAssignKind | null>(null);

  const maxStep = useMemo(() => (kind === "assessment_homework" ? 2 : 5), [kind]);

  const [mockExamId, setMockExamId] = useState<number | null>(null);
  const [pastpaperPackId, setPastpaperPackId] = useState<number | null>(null);
  const [pastpaperScope, setPastpaperScope] = useState<PastpaperScope>("BOTH");

  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [assignmentType, setAssignmentType] = useState("FULL");
  const [formType, setFormType] = useState("");

  const [studentQuery, setStudentQuery] = useState("");
  const [classroomFilter, setClassroomFilter] = useState<number | "all">("all");
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("ALL");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!canAssign) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await adminApi.listBulkAssignmentHistory();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e: any) {
      const msg = e?.response?.data?.detail;
      setHistoryError(typeof msg === "string" ? msg : "Could not load assignment history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [canAssign]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!intent) return;
    if (intent === "mocks") {
      setKind("timed_mock");
      setStep(1);
    } else if (intent === "pastpapers") {
      setKind("pastpaper");
      setPastpaperScope(defaultPastpaperScope);
      setStep(1);
    }
    onConsumeIntent();
  }, [intent, onConsumeIntent, defaultPastpaperScope]);

  useEffect(() => {
    if (kind === "assessment_homework" && step > 2) setStep(2);
  }, [kind, step]);

  const resetFlow = useCallback(
    (opts?: { keepResult?: boolean }) => {
      setStep(1);
      setKind(null);
      setMockExamId(null);
      setPastpaperPackId(null);
      setPastpaperScope(defaultPastpaperScope);
      setSelectedUserIds([]);
      setAssignmentType("FULL");
      setFormType("");
      setStudentQuery("");
      setClassroomFilter("all");
      setTrackFilter("ALL");
      setError(null);
      if (!opts?.keepResult) setLastResult(null);
    },
    [defaultPastpaperScope],
  );

  const selectedMock = useMemo(
    () => mockExams.find((m) => Number(m.id) === Number(mockExamId)) || null,
    [mockExams, mockExamId],
  );

  const resolvedPastpaperSectionIds = useMemo(() => {
    if (!pastpaperPackId) return [];
    return resolvePastpaperSectionIdsForPack(pastpaperPackId, pastpaperPacks as any, pastpaperScope);
  }, [pastpaperPackId, pastpaperPacks, pastpaperScope]);

  const subjectsForPastpaper = useMemo(() => {
    if (!pastpaperPackId) return new Set() as ReturnType<typeof platformSubjectsInResolvedPastpaper>;
    return platformSubjectsInResolvedPastpaper(pastpaperPackId, resolvedPastpaperSectionIds, pastpaperPacks as any);
  }, [pastpaperPackId, resolvedPastpaperSectionIds, pastpaperPacks]);

  const subjectsForMock = useMemo(() => {
    if (!selectedMock) return new Set() as ReturnType<typeof platformSubjectsForMockAssignment>;
    return platformSubjectsForMockAssignment(selectedMock as any, assignmentType, formType);
  }, [selectedMock, assignmentType, formType]);

  const students = useMemo(() => users.filter((u) => isStudentRole(u.role)), [users]);

  const classroomOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of students) {
      for (const c of u.bulk_assign_profile?.classrooms || []) {
        if (!map.has(c.id)) map.set(c.id, c.name);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return students.filter((u) => {
      if (!matchesClassroomFilter(u, classroomFilter)) return false;
      if (!matchesSubjectTrackFilter(u, trackFilter)) return false;
      if (!q) return true;
      const blob = `${studentDisplayName(u)} ${u.username || ""} ${u.email || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [students, studentQuery, classroomFilter, trackFilter]);

  const rowMeta = useCallback(
    (u: BulkAssignUserRow): EligibilityRow => {
      if (kind === "pastpaper") {
        return pastpaperRowEligibility(u.bulk_assign_profile, subjectsForPastpaper);
      }
      if (kind === "timed_mock") {
        return mockRowEligibility(u.bulk_assign_profile, subjectsForMock);
      }
      if (kind === "assessment_homework") {
        return { selectable: false, reason: "Use the assessment homework form (step 2)." };
      }
      return { selectable: true };
    },
    [kind, subjectsForPastpaper, subjectsForMock],
  );

  const mockOptions: SearchableOption<number>[] = useMemo(
    () =>
      mockExams.map((m) => {
        const tests = (m.tests as any[]) || [];
        const subs = [...new Set(tests.map((t) => t.subject).filter(Boolean))].join(", ");
        return {
          value: Number(m.id),
          primary: formatMockExamAdminLabel(m),
          secondary: subs ? `Subjects in shell: ${subs}` : undefined,
          keywords: `${m.id} ${m.title} ${m.kind}`,
        };
      }),
    [mockExams],
  );

  const packOptions: SearchableOption<number>[] = useMemo(
    () =>
      pastpaperPacks.map((p) => {
        const sec = pastpaperSectionSummary((p.sections as any[]) || []);
        const mix =
          sec.n === 0 ? "No sections" : sec.hasRw && sec.hasMath ? "R&W + Math" : sec.hasRw ? "English only" : "Math only";
        return {
          value: Number(p.id),
          primary: formatPastpaperPackAdminLabel(p),
          secondary: `${mix} · ${sec.n} section(s)`,
          keywords: `${p.id} ${p.title}`,
        };
      }),
    [pastpaperPacks],
  );

  const canGoNext = useMemo(() => {
    if (step === 1) return !!kind;
    if (step === 2) {
      if (kind === "assessment_homework") return false;
      if (kind === "timed_mock") return mockExamId != null;
      if (kind === "pastpaper") return pastpaperPackId != null && resolvedPastpaperSectionIds.length > 0;
    }
    if (step === 3) return selectedUserIds.length > 0;
    if (step === 4) return true;
    return true;
  }, [step, kind, mockExamId, pastpaperPackId, resolvedPastpaperSectionIds.length, selectedUserIds.length]);

  const goNext = () => setStep((s) => Math.min(maxStep, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const selectEligibleInView = () => {
    const ids: number[] = [];
    for (const u of filteredStudents) {
      const m = rowMeta(u);
      if (m.selectable) ids.push(u.id);
    }
    setSelectedUserIds(ids);
  };

  const selectAllEligibleGlobally = () => {
    if (!kind) return;
    const ids: number[] = [];
    for (const u of students) {
      if (rowMeta(u).selectable) ids.push(u.id);
    }
    setSelectedUserIds(ids);
  };

  const selectEligibleInClassroom = () => {
    if (!kind || classroomFilter === "all") return;
    const cid = classroomFilter;
    const ids: number[] = [];
    for (const u of students) {
      if (!studentInClassroom(u, cid)) continue;
      if (rowMeta(u).selectable) ids.push(u.id);
    }
    setSelectedUserIds(ids);
  };

  const selectAllInView = () => {
    setSelectedUserIds(filteredStudents.map((u) => u.id));
  };

  const clearSelection = () => setSelectedUserIds([]);

  const applyDispatchRow = (row: AssignmentDispatchRow, targetStep: 3 | 5 = 3) => {
    const payload = row.payload || {};
    const ctx = (payload as Record<string, unknown>).client_context as Record<string, unknown> | undefined;
    const cc = ctx && typeof ctx === "object" ? ctx : {};
    const examIdsFromPayload = Array.isArray((payload as Record<string, unknown>).exam_ids)
      ? ((payload as Record<string, unknown>).exam_ids as unknown[]).map((x) => Number(x)).filter((n) => !Number.isNaN(n))
      : [];
    const practiceIds = Array.isArray((payload as Record<string, unknown>).practice_test_ids)
      ? ((payload as Record<string, unknown>).practice_test_ids as unknown[]).map((x) => Number(x)).filter(Boolean)
      : [];
    let resolvedKind: BulkAssignKind =
      cc.wizard_kind === "pastpaper" || cc.wizard_kind === "timed_mock" ? (cc.wizard_kind as BulkAssignKind) : "pastpaper";
    if (!(cc.wizard_kind === "pastpaper" || cc.wizard_kind === "timed_mock")) {
      if (examIdsFromPayload.length && !practiceIds.length) resolvedKind = "timed_mock";
      else if (!examIdsFromPayload.length && practiceIds.length) resolvedKind = "pastpaper";
      else if (String(row.kind) === "timed_mock") resolvedKind = "timed_mock";
      else if (String(row.kind) === "pastpaper") resolvedKind = "pastpaper";
    }
    const inferred =
      resolvedKind === "pastpaper" && cc.pastpaper_pack_id == null && practiceIds.length
        ? inferPastpaperFromSectionIds(practiceIds, pastpaperPacks as Array<{ id: number; sections?: Array<{ id: number; subject: string }> }>)
        : null;
    setKind(resolvedKind);
    setPastpaperPackId(cc.pastpaper_pack_id != null ? Number(cc.pastpaper_pack_id) : inferred?.packId ?? null);
    setPastpaperScope((cc.pastpaper_scope as PastpaperScope) || inferred?.scope || defaultPastpaperScope);
    setMockExamId(cc.mock_exam_id != null ? Number(cc.mock_exam_id) : null);
    setAssignmentType(String((payload as Record<string, unknown>).assignment_type || "FULL"));
    const ft = (payload as Record<string, unknown>).form_type;
    setFormType(typeof ft === "string" ? ft : "");
    const tf = cc.track_filter;
    if (tf === "ALL" || tf === "MATH" || tf === "ENGLISH") setTrackFilter(tf);
    const ids = Array.isArray((payload as Record<string, unknown>).user_ids)
      ? ((payload as Record<string, unknown>).user_ids as unknown[]).map((x) => Number(x)).filter((n) => !Number.isNaN(n))
      : [];
    setSelectedUserIds(ids);
    setStep(targetStep);
    setError(null);
    setLastResult(null);
  };

  const handleLoadDispatchInWizard = (row: AssignmentDispatchRow) => {
    applyDispatchRow(row, 3);
    showToast("Loaded dispatch into the wizard — review students and run again if needed.");
  };

  const handleRerunDispatch = async (id: number) => {
    setRerunBusyId(id);
    setError(null);
    try {
      const res = (await adminApi.rerunBulkAssignmentDispatch(id)) as Record<string, unknown>;
      const skipped = Number(res.students_skipped_count || 0);
      const granted = Number(res.students_granted_count ?? 0);
      setLastResult(mapAssignApiToLastResult(res, true));
      showToast(
        skipped > 0
          ? `Re-run finished: ${granted} student(s) granted access, ${skipped} skipped (see details below).`
          : `Re-run finished: ${granted} student(s) granted access.`,
      );
      await fetchHistory();
    } catch (e: any) {
      const msg = e?.response?.data?.detail;
      const text = typeof msg === "string" ? msg : "Could not re-run that assignment.";
      setError(text);
      showToast(text);
    } finally {
      setRerunBusyId(null);
    }
  };

  const submit = async () => {
    if (!canAssign || !kind) return;
    if (kind === "assessment_homework") return;
    if (selectedUserIds.length === 0) {
      showToast("Select at least one student");
      return;
    }
    if (kind === "timed_mock" && !mockExamId) {
      showToast("Select a timed mock");
      return;
    }
    if (kind === "pastpaper" && (!pastpaperPackId || resolvedPastpaperSectionIds.length === 0)) {
      showToast("Select a pastpaper card with sections in the current scope");
      return;
    }

    setSubmitting(true);
    setError(null);
    const isMocks = kind === "timed_mock";
    const contentLabel =
      isMocks && selectedMock
        ? formatMockExamAdminLabel(selectedMock)
        : pastpaperPackId
          ? formatPastpaperPackAdminLabel(pastpaperPacks.find((p) => Number(p.id) === pastpaperPackId))
          : "Assignment";

    const clientContext: Record<string, unknown> = {
      wizard_kind: kind,
      pastpaper_pack_id: pastpaperPackId ?? undefined,
      pastpaper_scope: pastpaperScope,
      mock_exam_id: mockExamId ?? undefined,
      content_label: contentLabel,
      track_filter: trackFilter,
    };

    try {
      const res = (await adminApi.bulkAssignStudents(
        isMocks && mockExamId ? [mockExamId] : [],
        selectedUserIds,
        isMocks ? assignmentType : "FULL",
        isMocks ? formType || undefined : undefined,
        !isMocks && resolvedPastpaperSectionIds.length ? resolvedPastpaperSectionIds : undefined,
        clientContext,
      )) as Record<string, unknown>;

      const added = typeof res?.tests_added === "number" ? res.tests_added : null;
      const matched = typeof res?.practice_tests_matched === "number" ? res.practice_tests_matched : null;
      const requested = typeof res?.practice_tests_requested === "number" ? res.practice_tests_requested : null;
      const skippedN = Number(res.students_skipped_count || 0);
      const grantsCreated =
        typeof res?.subject_grants_created === "number" ? res.subject_grants_created : 0;
      const grantNote =
        grantsCreated > 0
          ? ` ${grantsCreated} subject access grant(s) added for students who had none.`
          : "";

      if (!isMocks && requested != null && matched != null && matched < requested) {
        showToast(
          `Assigned library sections: ${matched} of ${requested} IDs matched. ${selectedUserIds.length} user(s).${grantNote}`,
        );
      } else if (!isMocks && added === 0 && resolvedPastpaperSectionIds.length > 0) {
        showToast("No assignments were saved. Check section IDs.");
      } else {
        showToast(
          skippedN > 0
            ? `Granted where eligible: ${res.students_granted_count ?? "?"} of ${selectedUserIds.length} student(s); ${skippedN} skipped.${grantNote}`
            : added != null
              ? `Granted access (${added} test link(s)) to ${selectedUserIds.length} user(s).${grantNote}`
              : `Assigned access to ${selectedUserIds.length} user(s).${grantNote}`,
        );
      }

      setLastResult(mapAssignApiToLastResult(res, true));
      await fetchHistory();
      await onAfterSuccess();
      resetFlow({ keepResult: true });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : "Failed to perform bulk assignment";
      setError(msg);
      showToast(msg);
      const body = err?.response?.data;
      if (body && typeof body === "object") {
        setLastResult(mapAssignApiToLastResult(body as Record<string, unknown>, false, msg));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!canAssign) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 text-sm text-amber-900">
        You do not have permission to bulk-assign. Ask an admin to grant <strong>assign_access</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Bulk assignment</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Guided flow to grant library access. Access is enforced server-side; students without subject grants still
            skip sections they cannot receive.
          </p>
        </div>
        <button type="button" className={BTN_GHOST} onClick={() => resetFlow()}>
          Reset wizard
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-900 flex flex-wrap items-start gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      ) : null}

      {lastResult ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex flex-col gap-2 ${
            lastResult.ok
              ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
              : "border-red-200 bg-red-50/90 text-red-950"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              {lastResult.ok ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="font-bold">{lastResult.ok ? "Assignment finished" : "Assignment failed"}</p>
                {lastResult.dispatch_id != null ? (
                  <p className="text-xs opacity-90 mt-0.5">
                    Dispatch #{lastResult.dispatch_id}
                    {lastResult.dispatch_status ? ` · status ${lastResult.dispatch_status}` : ""}
                  </p>
                ) : null}
                <p className="text-xs mt-1">
                  {lastResult.students_granted_count != null && lastResult.students_requested_count != null
                    ? `${lastResult.students_granted_count} of ${lastResult.students_requested_count} students received access in this run.`
                    : null}
                  {lastResult.students_skipped_count != null && lastResult.students_skipped_count > 0 ? (
                    <span className="block text-amber-900 font-medium mt-1">
                      {lastResult.students_skipped_count} student(s) skipped (non-students or no matching subject access).
                    </span>
                  ) : null}
                  {lastResult.tests_added != null ? (
                    <span className="block mt-1">Test links added this run: {lastResult.tests_added}</span>
                  ) : null}
                  {!lastResult.ok && lastResult.message ? (
                    <span className="block mt-1 font-medium">{lastResult.message}</span>
                  ) : null}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary text-xs !px-2 !py-1 shrink-0 inline-flex items-center gap-1"
              onClick={() => setLastResult(null)}
              aria-label="Dismiss result"
            >
              <X className="w-3.5 h-3.5" /> Dismiss
            </button>
          </div>
          {lastResult.skipped_users && lastResult.skipped_users.length > 0 ? (
            <div className="border-t border-black/10 pt-2 mt-1">
              <p className="text-[11px] font-bold uppercase tracking-wide opacity-80 mb-1">Skipped users</p>
              <ul className="max-h-40 overflow-y-auto text-xs space-y-1 list-disc pl-4">
                {lastResult.skipped_users.slice(0, 50).map((s) => (
                  <li key={s.user_id}>
                    <span className="font-semibold">{s.display_name || s.username || `#${s.user_id}`}</span>
                    {s.reason ? <span className="text-slate-700"> — {s.reason}</span> : null}
                  </li>
                ))}
              </ul>
              {lastResult.skipped_users.length > 50 ? (
                <p className="text-[11px] mt-1 opacity-80">Showing first 50; full list is in server history.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <ol className="flex flex-wrap gap-2">
        {STEP_META.map((s) => (
          <li
            key={s.id}
            className={`flex-1 min-w-[120px] rounded-xl border px-3 py-2 text-left transition ${
              kind === "assessment_homework" && s.id > maxStep ? "opacity-40 border-slate-100 bg-slate-50" : ""
            } ${
              step === s.id
                ? "border-indigo-300 bg-indigo-50/90 shadow-sm"
                : s.id < step
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Step {s.id}</p>
            <p className="text-xs font-bold text-slate-900">{s.title}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{s.hint}</p>
          </li>
        ))}
      </ol>

      {loadingUsers ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 py-6">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
          Loading directory…
        </div>
      ) : null}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setKind("pastpaper");
              setPastpaperScope(defaultPastpaperScope);
            }}
            className={`rounded-2xl border p-6 text-left transition shadow-sm ${
              kind === "pastpaper"
                ? "border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-200"
                : "border-slate-200 bg-white hover:border-emerald-200"
            }`}
          >
            <ClipboardList className="w-8 h-8 text-emerald-600 mb-3" />
            <h3 className="text-lg font-bold text-slate-900">Pastpaper</h3>
            <p className="text-sm text-slate-600 mt-1">Standalone library sections (English / Math) from a card.</p>
          </button>
          <button
            type="button"
            onClick={() => setKind("timed_mock")}
            className={`rounded-2xl border p-6 text-left transition shadow-sm ${
              kind === "timed_mock"
                ? "border-indigo-400 bg-indigo-50/80 ring-2 ring-indigo-200"
                : "border-slate-200 bg-white hover:border-indigo-200"
            }`}
          >
            <Layers className="w-8 h-8 text-indigo-600 mb-3" />
            <h3 className="text-lg font-bold text-slate-900">Timed mock</h3>
            <p className="text-sm text-slate-600 mt-1">Published or draft mock shell — pick sections (full / math / English).</p>
          </button>
          <button
            type="button"
            onClick={() => setKind("assessment_homework")}
            className={`rounded-2xl border p-6 text-left transition shadow-sm sm:col-span-2 xl:col-span-1 ${
              kind === "assessment_homework"
                ? "border-violet-400 bg-violet-50/80 ring-2 ring-violet-200"
                : "border-slate-200 bg-white hover:border-violet-200"
            }`}
          >
            <ListChecks className="w-8 h-8 text-violet-600 mb-3" />
            <h3 className="text-lg font-bold text-slate-900">Assessments</h3>
            <p className="text-sm text-slate-600 mt-1">
              Published LMS assessment set → homework on a classroom (not the same as bulk student grants).
            </p>
          </button>
        </div>
      )}

      {step === 2 && kind === "assessment_homework" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Assign below. When you are done, use <strong>Done</strong> to return to the type step, or <strong>Reset wizard</strong> at the top.
          </p>
          <AssessmentClassroomAssignPanel canAssign={canAssign} showToast={showToast} />
        </div>
      )}

      {step === 2 && kind === "timed_mock" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Timed mock</label>
          <SearchableSelect
            options={mockOptions}
            value={mockExamId}
            onChange={(id) => setMockExamId(id)}
            placeholder="Search mocks…"
            emptyHint="No mock exams loaded"
          />
          {!mockExams.length ? (
            <p className="text-xs text-amber-700">Create a mock on the Mock exams tab first.</p>
          ) : null}
        </div>
      )}

      {step === 2 && kind === "pastpaper" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Pastpaper card</label>
          <SearchableSelect
            options={packOptions}
            value={pastpaperPackId}
            onChange={(id) => setPastpaperPackId(id)}
            placeholder="Search cards…"
            emptyHint="No pastpaper cards"
          />
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject scope</span>
            <div className="flex bg-slate-100 p-1 rounded-xl mt-2 max-w-md">
              {(
                [
                  { id: "BOTH" as const, label: "Both" },
                  { id: "READING_WRITING" as const, label: "English" },
                  { id: "MATH" as const, label: "Math" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPastpaperScope(opt.id)}
                  className={`flex-1 py-2 px-2 rounded-lg text-[11px] font-bold transition ${
                    pastpaperScope === opt.id ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Resolves to <strong>{resolvedPastpaperSectionIds.length}</strong> practice section(s) for this assignment
              run.
            </p>
            {pastpaperPackId && resolvedPastpaperSectionIds.length === 0 ? (
              <p className="text-xs text-red-600 mt-1">No sections for this scope — change scope or pick another card.</p>
            ) : null}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-end bg-slate-50/80">
            <div className="flex flex-col gap-1 min-w-[160px] flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Search</span>
              <input
                className={INPUT + " !text-sm"}
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="Name, username, email…"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Classroom</span>
              <select
                className={INPUT + " !text-sm"}
                value={classroomFilter === "all" ? "all" : String(classroomFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setClassroomFilter(v === "all" ? "all" : Number(v));
                }}
              >
                <option value="all">All classrooms</option>
                {classroomOptions.map(([id, name]) => (
                  <option key={id} value={String(id)}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[130px]">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Subject track</span>
              <select
                className={INPUT + " !text-sm"}
                value={trackFilter}
                onChange={(e) => setTrackFilter(e.target.value as TrackFilter)}
              >
                <option value="ALL">All tracks</option>
                <option value="MATH">Math track</option>
                <option value="ENGLISH">English track</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto">
              <button type="button" className={BTN_GHOST} onClick={clearSelection}>
                Clear selection
              </button>
              <button type="button" className={BTN_GHOST} onClick={selectAllInView}>
                Select all in view
              </button>
              <button type="button" className={BTN_GHOST} onClick={selectEligibleInView}>
                Eligible in view
              </button>
              <button
                type="button"
                className={BTN_GHOST}
                disabled={classroomFilter === "all"}
                title={classroomFilter === "all" ? "Pick a classroom first" : undefined}
                onClick={selectEligibleInClassroom}
              >
                Eligible in classroom
              </button>
              <button type="button" className={BTN_GHOST} onClick={selectAllEligibleGlobally} disabled={!kind}>
                All eligible students
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-2 w-10">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-4 py-2">Student</th>
                  <th className="px-4 py-2">Subject access</th>
                  <th className="px-4 py-2">Classrooms</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Assignment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                      No students match these filters.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((u) => {
                    const meta = rowMeta(u);
                    const g = u.bulk_assign_profile?.subject_grants;
                    const checked = selectedUserIds.includes(u.id);
                    return (
                      <tr key={u.id} className={meta.selectable ? "hover:bg-slate-50/80" : "bg-slate-50/50"}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={checked}
                            title={
                              meta.selectable
                                ? undefined
                                : `${meta.reason ?? "May be skipped"} — server only grants when subject access exists`
                            }
                            onChange={(e) => {
                              if (e.target.checked) setSelectedUserIds((prev) => [...new Set([...prev, u.id])]);
                              else setSelectedUserIds((prev) => prev.filter((id) => id !== u.id));
                            }}
                          />
                        </td>
                        <td className="px-4 py-2 font-semibold text-slate-900">{studentDisplayName(u)}</td>
                        <td className="px-4 py-2 text-xs">
                          <span className={g?.math ? "text-emerald-700 font-medium" : "text-slate-400"}>Math</span>
                          <span className="mx-1 text-slate-300">·</span>
                          <span className={g?.english ? "text-emerald-700 font-medium" : "text-slate-400"}>R&amp;W</span>
                          {!u.bulk_assign_profile ? (
                            <span className="block text-amber-600 mt-0.5">Refresh user list for access data</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-600 max-w-[200px]">
                          {(u.bulk_assign_profile?.classrooms || []).length
                            ? u.bulk_assign_profile!.classrooms.map((c) => c.name).join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs">{accountStatusLabel(u)}</td>
                        <td className="px-4 py-2 text-xs">
                          {!meta.selectable ? (
                            <span className="text-red-600 font-medium">{meta.reason}</span>
                          ) : meta.partialHint ? (
                            <span className="text-amber-700 font-medium">{meta.partialHint}</span>
                          ) : (
                            <span className="text-emerald-700 font-medium">Eligible</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 4 && kind === "timed_mock" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sections to assign</span>
            <div className="flex flex-wrap gap-2 mt-2 bg-slate-100 p-1 rounded-2xl max-w-xl">
              {[
                { id: "FULL", label: "Full exam" },
                { id: "MATH", label: "Math only" },
                { id: "ENGLISH", label: "English only" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAssignmentType(t.id)}
                  className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-xl text-xs font-bold transition ${
                    assignmentType === t.id ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Form filter</span>
            <div className="flex flex-wrap gap-2 mt-2 bg-slate-100 p-1 rounded-2xl max-w-xl">
              {[
                { id: "", label: "All forms" },
                { id: "INTERNATIONAL", label: "International" },
                { id: "US", label: "US" },
              ].map((t) => (
                <button
                  key={t.id || "all"}
                  type="button"
                  onClick={() => setFormType(t.id)}
                  className={`flex-1 min-w-[90px] py-2.5 px-3 rounded-xl text-xs font-bold transition ${
                    formType === t.id ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 border border-slate-100 rounded-xl p-3 bg-slate-50/80">
            Section mode, form filter, and selected students are stored with each dispatch on the server (see history).
          </p>
        </div>
      )}

      {step === 4 && kind === "pastpaper" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <p className="text-sm text-slate-700">
            Subject scope is set in step 2. Adjust there if you need only English or Math sections from this card.
          </p>
          <p className="text-xs text-slate-500 border border-slate-100 rounded-xl p-3 bg-slate-50/80">
            Section list, form filter, and student list are stored on the server with each dispatch (see history). The
            API does not support per-student deadlines here — use class assignments for due dates if you need them.
          </p>
        </div>
      )}

      {step === 5 && kind && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Content
            </h3>
            <p className="text-sm text-slate-700">
              {kind === "timed_mock" && selectedMock
                ? formatMockExamAdminLabel(selectedMock)
                : pastpaperPackId
                  ? formatPastpaperPackAdminLabel(pastpaperPacks.find((p) => Number(p.id) === pastpaperPackId))
                  : "—"}
            </p>
            <p className="text-xs text-slate-500">
              {kind === "pastpaper"
                ? `Scope: ${pastpaperScope} · ${resolvedPastpaperSectionIds.length} section(s)`
                : `Sections: ${assignmentType}${formType ? ` · ${formType}` : ""}`}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" /> Students ({selectedUserIds.length})
            </h3>
            <p className="text-xs text-slate-600 max-h-28 overflow-y-auto">
              {selectedUserIds
                .map((id) => {
                  const u = users.find((x) => x.id === id);
                  return u ? studentDisplayName(u) : `#${id}`;
                })
                .join(", ")}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2 space-y-2">
            <h3 className="text-sm font-bold text-slate-900">What gets saved</h3>
            <p className="text-xs text-slate-600">
              After you confirm, the server records this run (content, students, outcome, status). Use{" "}
              <strong>Use in wizard</strong> in history to reload a dispatch, or <strong>Re-run</strong> to replay the
              stored payload immediately.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
        <button type="button" className={BTN_GHOST} disabled={step <= 1} onClick={goBack}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {kind === "assessment_homework" && step === 2 ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-xs text-slate-500 max-w-md text-right">
              Student bulk steps do not apply to this path — the panel above talks to the homework API directly.
            </p>
            <button type="button" className={BTN_PRIMARY} onClick={() => resetFlow()}>
              Done
            </button>
          </div>
        ) : step < maxStep ? (
          <button type="button" className={BTN_PRIMARY} disabled={!canGoNext} onClick={goNext}>
            Next <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button type="button" className={BTN_PRIMARY} disabled={submitting || !canGoNext} onClick={() => void submit()}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {submitting ? "Granting…" : "Confirm & assign"}
          </button>
        )}
      </div>

      <AssignmentHistoryPanel
        entries={history}
        loading={historyLoading}
        error={historyError}
        onRefresh={() => void fetchHistory()}
        onLoadInWizard={handleLoadDispatchInWizard}
        onRerun={(id) => void handleRerunDispatch(id)}
        rerunBusyId={rerunBusyId}
      />
    </div>
  );
}
