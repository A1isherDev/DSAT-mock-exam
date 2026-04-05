"use client";

import { useEffect, useMemo, useState } from "react";
import { classesApi } from "@/lib/api";
import {
  buildHomeworkPastpaperCards,
  formatLineDate,
  sharedPastpaperPackTitle,
  singleDisplayTitle,
  subjectLabel,
  type CardPastpaperPack,
  type CardSingle,
} from "@/lib/practiceTestCards";
import {
  ClassroomAlert,
  ClassroomButton,
  ClassroomField,
  ClassroomModal,
  crInputClass,
  crSelectClass,
} from "@/components/classroom";
import { Loader2 } from "lucide-react";

type AssignmentOptMock = { id: number; title: string; practice_date: string | null; kind: string };

type PastpaperRow = Record<string, unknown> & {
  id: number;
  pastpaper_pack?: { id: number; title?: string; practice_date?: string | null; label?: string; form_type?: string } | null;
  pastpaper_pack_id?: number | null;
};

type PastSelection =
  | { mode: "none" }
  | { mode: "single"; testId: number }
  | { mode: "pack_db"; packId: number }
  | { mode: "pack_legacy"; testIds: number[] };

type Props = {
  open: boolean;
  classId: number;
  /** When set, modal edits this assignment (JSON PATCH; files stay as-is). */
  editingAssignment?: Record<string, unknown> | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
};

function cardReactKey(c: CardPastpaperPack | CardSingle): string {
  if (c.kind === "single") return `single-${c.test.id}`;
  return `pack-${c.packKey}`;
}

function selectionMatchesCard(sel: PastSelection, c: CardPastpaperPack | CardSingle): boolean {
  if (c.kind === "single") return sel.mode === "single" && sel.testId === c.test.id;
  if (c.pack?.id != null) return sel.mode === "pack_db" && sel.packId === c.pack.id;
  const ids = c.tests.map((t) => t.id).sort((a, b) => a - b);
  if (sel.mode !== "pack_legacy" || ids.length === 0) return false;
  const a = [...sel.testIds].sort((x, y) => x - y);
  return a.length === ids.length && a.every((v, i) => v === ids[i]);
}

function selectFromCard(c: CardPastpaperPack | CardSingle): PastSelection {
  if (c.kind === "single") return { mode: "single", testId: c.test.id };
  if (c.pack?.id != null) return { mode: "pack_db", packId: c.pack.id };
  return { mode: "pack_legacy", testIds: c.tests.map((t) => t.id) };
}

export default function CreateAssignmentModal({
  open,
  classId,
  editingAssignment = null,
  onClose,
  onSuccess,
}: Props) {
  const [newAsg, setNewAsg] = useState({
    title: "",
    instructions: "",
    external_url: "",
    mock_exam: "",
  });
  const [pastSel, setPastSel] = useState<PastSelection>({ mode: "none" });
  const [dueLocal, setDueLocal] = useState("");
  const [asgFiles, setAsgFiles] = useState<File[]>([]);
  const [assignmentOptions, setAssignmentOptions] = useState<{
    mock_exams: AssignmentOptMock[];
    practice_tests: PastpaperRow[];
  }>({ mock_exams: [], practice_tests: [] });
  const [asgOptionsLoading, setAsgOptionsLoading] = useState(false);
  const [asgOptionsError, setAsgOptionsError] = useState<string | null>(null);
  const [creatingAsg, setCreatingAsg] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pastpaperCards = useMemo(
    () => buildHomeworkPastpaperCards(assignmentOptions.practice_tests as any[]),
    [assignmentOptions.practice_tests]
  );

  const resetForm = () => {
    setNewAsg({
      title: "",
      instructions: "",
      external_url: "",
      mock_exam: "",
    });
    setPastSel({ mode: "none" });
    setDueLocal("");
    setAsgFiles([]);
    setFormError(null);
  };

  useEffect(() => {
    if (!open || !Number.isFinite(classId)) return;
    let cancelled = false;
    (async () => {
      setAsgOptionsLoading(true);
      setAsgOptionsError(null);
      try {
        const d = await classesApi.getAssignmentOptions(classId);
        if (!cancelled) {
          setAssignmentOptions({
            mock_exams: Array.isArray(d.mock_exams) ? d.mock_exams : [],
            practice_tests: Array.isArray(d.practice_tests) ? d.practice_tests : [],
          });
        }
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        if (!cancelled) {
          setAssignmentOptions({ mock_exams: [], practice_tests: [] });
          setAsgOptionsError(typeof msg === "string" ? msg : "Could not load test lists.");
        }
      } finally {
        if (!cancelled) setAsgOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, classId]);

  useEffect(() => {
    if (!open) return;
    if (!editingAssignment) {
      resetForm();
      return;
    }
    setNewAsg({
      title: String(editingAssignment.title ?? ""),
      instructions: String(editingAssignment.instructions ?? ""),
      external_url: String(editingAssignment.external_url ?? ""),
      mock_exam:
        editingAssignment.mock_exam != null ? String((editingAssignment.mock_exam as { id?: number }).id ?? editingAssignment.mock_exam) : "",
    });
    const due = editingAssignment.due_at;
    if (due && typeof due === "string") {
      const d = new Date(due);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        setDueLocal(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        );
      } else setDueLocal("");
    } else setDueLocal("");
    const pp = editingAssignment.pastpaper_pack;
    if (pp != null) {
      const packId = typeof pp === "object" && pp != null && "id" in pp ? Number((pp as { id: number }).id) : Number(pp);
      if (Number.isFinite(packId)) setPastSel({ mode: "pack_db", packId });
      else setPastSel({ mode: "none" });
    } else if (Array.isArray(editingAssignment.practice_test_ids) && editingAssignment.practice_test_ids.length > 0) {
      setPastSel({
        mode: "pack_legacy",
        testIds: (editingAssignment.practice_test_ids as unknown[]).map((x) => Number(x)),
      });
    } else if (editingAssignment.practice_test != null) {
      const pt = editingAssignment.practice_test;
      const tid = typeof pt === "object" && pt != null && "id" in pt ? Number((pt as { id: number }).id) : Number(pt);
      if (Number.isFinite(tid)) setPastSel({ mode: "single", testId: tid });
      else setPastSel({ mode: "none" });
    } else {
      setPastSel({ mode: "none" });
    }
    setAsgFiles([]);
    setFormError(null);
  }, [open, editingAssignment]);

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const handleSubmit = async () => {
    setFormError(null);
    setCreatingAsg(true);
    try {
      const editId = editingAssignment != null ? Number(editingAssignment.id) : NaN;
      if (Number.isFinite(editId)) {
        const body: Record<string, unknown> = {
          title: newAsg.title.trim(),
          instructions: newAsg.instructions,
          external_url: newAsg.external_url.trim() || "",
          due_at: null as string | null,
          mock_exam: newAsg.mock_exam ? Number(newAsg.mock_exam) : null,
          pastpaper_pack: null,
          practice_test: null,
          practice_test_ids: null,
        };
        if (dueLocal.trim()) {
          const t = new Date(dueLocal);
          if (!Number.isNaN(t.getTime())) body.due_at = t.toISOString();
        }
        if (pastSel.mode === "pack_db") body.pastpaper_pack = pastSel.packId;
        else if (pastSel.mode === "pack_legacy") body.practice_test_ids = pastSel.testIds;
        else if (pastSel.mode === "single") body.practice_test = pastSel.testId;

        await classesApi.updateAssignment(classId, editId, body);
        resetForm();
        await onSuccess();
        onClose();
        return;
      }

      const fd = new FormData();
      fd.append("title", newAsg.title.trim());
      fd.append("instructions", newAsg.instructions);
      if (dueLocal.trim()) {
        const t = new Date(dueLocal);
        if (!Number.isNaN(t.getTime())) fd.append("due_at", t.toISOString());
      }
      if (newAsg.external_url.trim()) fd.append("external_url", newAsg.external_url.trim());
      if (newAsg.mock_exam) fd.append("mock_exam", String(Number(newAsg.mock_exam)));

      if (pastSel.mode === "pack_db") fd.append("pastpaper_pack", String(pastSel.packId));
      else if (pastSel.mode === "pack_legacy") fd.append("practice_test_ids", JSON.stringify(pastSel.testIds));
      else if (pastSel.mode === "single") fd.append("practice_test", String(pastSel.testId));

      for (const f of asgFiles) {
        fd.append("attachment_file", f);
      }

      await classesApi.createAssignment(classId, fd, true);
      resetForm();
      await onSuccess();
      onClose();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setFormError(typeof d === "string" ? d : editingAssignment ? "Could not save assignment." : "Could not create assignment.");
    } finally {
      setCreatingAsg(false);
    }
  };

  const cardBase =
    "text-left rounded-xl border px-4 py-3 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900";
  const cardUnsel =
    "border-slate-200/90 bg-white/80 hover:border-indigo-200/60 hover:bg-slate-50/90 dark:border-slate-600 dark:bg-slate-900/40 dark:hover:border-indigo-500/30";
  const cardSel =
    "border-indigo-400 bg-indigo-50/90 ring-2 ring-indigo-500/25 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/40 dark:ring-indigo-400/20";

  return (
    <ClassroomModal
      open={open}
      onClose={onClose}
      titleId="create-asg-title"
      eyebrow={editingAssignment ? "Edit assignment" : "New assignment"}
      title={editingAssignment ? "Update homework" : "Create assignment"}
      description="Mock is timed diagnostic; pastpaper cards match the student library. Title is required; links are optional."
      size="lg"
    >
      <div className="space-y-4">
        {formError ? <ClassroomAlert tone="error">{formError}</ClassroomAlert> : null}

        {asgOptionsLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
            Loading tests…
          </div>
        ) : null}
        {asgOptionsError ? <ClassroomAlert tone="warning">{asgOptionsError}</ClassroomAlert> : null}

        <ClassroomField label="Title *" htmlFor="asg-title">
          <input
            id="asg-title"
            value={newAsg.title}
            onChange={(e) => setNewAsg((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. May SAT Reading practice"
            className={`${crInputClass} font-semibold`}
          />
        </ClassroomField>

        <ClassroomField label="Instructions" htmlFor="asg-inst">
          <textarea
            id="asg-inst"
            value={newAsg.instructions}
            onChange={(e) => setNewAsg((p) => ({ ...p, instructions: e.target.value }))}
            placeholder="Short directions for students"
            rows={4}
            className={crInputClass}
          />
        </ClassroomField>

        <ClassroomField label="Due date & time" htmlFor="asg-due" hint="Leave empty for no deadline.">
          <input
            id="asg-due"
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
            className={crInputClass}
          />
        </ClassroomField>

        <ClassroomField label="External link (optional)" htmlFor="asg-url">
          <input
            id="asg-url"
            value={newAsg.external_url}
            onChange={(e) => setNewAsg((p) => ({ ...p, external_url: e.target.value }))}
            placeholder="https://…"
            className={crInputClass}
          />
        </ClassroomField>

        <ClassroomField label="Mock exam" htmlFor="asg-mock">
          <select
            id="asg-mock"
            value={newAsg.mock_exam}
            onChange={(e) => setNewAsg((p) => ({ ...p, mock_exam: e.target.value }))}
            className={crSelectClass}
          >
            <option value="">— None —</option>
            {assignmentOptions.mock_exams.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
                {m.practice_date ? ` · ${m.practice_date}` : ""}
                {m.kind === "MIDTERM" ? " (midterm)" : ""}
              </option>
            ))}
          </select>
        </ClassroomField>

        <ClassroomField
          label="Pastpaper (full exam card)"
          hint="One card can combine R&W and Math. Students open each section from the assignment."
        >
          <div className="grid max-h-[320px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPastSel({ mode: "none" })}
                className={`${cardBase} ${pastSel.mode === "none" ? cardSel : cardUnsel}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">Pastpaper</p>
                <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">No practice test</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">No linked pastpaper</p>
              </button>
              {pastpaperCards.map((c) => {
                const selected = selectionMatchesCard(pastSel, c);
                const lineDate =
                  c.kind === "pastpaper_pack"
                    ? c.pack?.practice_date || c.tests[0]?.practice_date || c.tests[0]?.created_at
                    : c.test.practice_date || c.test.created_at;
                const heading =
                  c.kind === "pastpaper_pack"
                    ? (c.pack?.title && String(c.pack.title).trim()) || sharedPastpaperPackTitle(c.tests)
                    : singleDisplayTitle(c.test);
                const sectionRows =
                  c.kind === "pastpaper_pack" ? c.tests : [{ id: c.test.id, subject: c.test.subject }];

                return (
                  <button
                    key={cardReactKey(c)}
                    type="button"
                    onClick={() => setPastSel(selectFromCard(c))}
                    className={`${cardBase} ${selected ? cardSel : cardUnsel}`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      Practice test
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-400">{formatLineDate(lineDate)}</p>
                    <p className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-slate-900 dark:text-slate-50">
                      {heading}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {sectionRows.map((t) => (
                        <span
                          key={t.id}
                          className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800 dark:text-violet-200"
                        >
                          {subjectLabel(t.subject)}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
          </div>
        </ClassroomField>

        <ClassroomField label={editingAssignment ? "Attached files" : "Files (optional)"}>
          {editingAssignment ? (
            <p className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
              {Array.isArray(editingAssignment.attachment_urls) && editingAssignment.attachment_urls.length > 0
                ? `${editingAssignment.attachment_urls.length} file(s) on this assignment. Editing does not replace files — create a new assignment if you need different attachments.`
                : "No files on this assignment."}
            </p>
          ) : (
            <>
              <input
                type="file"
                multiple
                onChange={(e) => setAsgFiles(Array.from(e.target.files || []))}
                className="w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-500/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-500/15 dark:text-slate-400 dark:file:bg-indigo-500/20 dark:file:text-indigo-200"
              />
              {asgFiles.length > 0 ? (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{asgFiles.length} file(s) selected.</p>
              ) : null}
            </>
          )}
        </ClassroomField>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200/70 pt-4 dark:border-slate-700/70 sm:flex-row">
          <ClassroomButton
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              resetForm();
              onClose();
            }}
          >
            Cancel
          </ClassroomButton>
          <ClassroomButton
            type="button"
            variant="primary"
            className="flex-1"
            onClick={handleSubmit}
            disabled={!newAsg.title.trim() || creatingAsg}
          >
            {creatingAsg ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editingAssignment ? "Save changes" : "Create"}
          </ClassroomButton>
        </div>
      </div>
    </ClassroomModal>
  );
}
