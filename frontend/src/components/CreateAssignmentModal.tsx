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
import { Loader2, X } from "lucide-react";

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

export default function CreateAssignmentModal({ open, classId, onClose, onSuccess }: Props) {
  const [newAsg, setNewAsg] = useState({
    title: "",
    instructions: "",
    external_url: "",
    mock_exam: "",
  });
  const [pastSel, setPastSel] = useState<PastSelection>({ mode: "none" });
  const [dueLocal, setDueLocal] = useState("");
  const [asgFile, setAsgFile] = useState<File | null>(null);
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
    setAsgFile(null);
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
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleCreate = async () => {
    setFormError(null);
    setCreatingAsg(true);
    try {
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

      if (asgFile) fd.append("attachment_file", asgFile);

      await classesApi.createAssignment(classId, fd, true);
      resetForm();
      await onSuccess();
      onClose();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setFormError(typeof d === "string" ? d : "Could not create assignment.");
    } finally {
      setCreatingAsg(false);
    }
  };

  const cardBase =
    "text-left rounded-2xl border px-4 py-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
  const cardUnsel = "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80";
  const cardSel = "border-blue-500 bg-blue-50/90 ring-2 ring-blue-500/40 shadow-sm";

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-asg-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white rounded-t-3xl">
          <div>
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">New assignment</p>
            <h2 id="create-asg-title" className="text-xl font-extrabold text-slate-900">
              Create assignment
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {formError ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formError}</div>
          ) : null}

          {asgOptionsLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              Loading tests…
            </div>
          ) : null}
          {asgOptionsError ? (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{asgOptionsError}</div>
          ) : null}

          <p className="text-xs text-slate-500 leading-relaxed">
            <strong>Mock</strong> is a timed diagnostic exam. <strong>Pastpaper</strong> matches the practice-test library:
            one card per full exam (English + Math when both exist). All links are optional; title is required.
          </p>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Title *</label>
            <input
              value={newAsg.title}
              onChange={(e) => setNewAsg((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. May SAT Reading practice"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Instructions</label>
            <textarea
              value={newAsg.instructions}
              onChange={(e) => setNewAsg((p) => ({ ...p, instructions: e.target.value }))}
              placeholder="Short directions for students"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm min-h-[100px] focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Due date &amp; time</label>
            <input
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">Leave empty for no deadline.</p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              External link (optional)
            </label>
            <input
              value={newAsg.external_url}
              onChange={(e) => setNewAsg((p) => ({ ...p, external_url: e.target.value }))}
              placeholder="https://…"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Mock exam</label>
            <select
              value={newAsg.mock_exam}
              onChange={(e) => setNewAsg((p) => ({ ...p, mock_exam: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none"
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
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              Pastpaper (full exam card)
            </label>
            <p className="text-[11px] text-slate-500 mb-2">
              Same grouping as the student practice-test page: one card combines Reading &amp; Writing and Math when they
              share a pastpaper. Students open each section from the assignment.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 max-h-[320px] overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => setPastSel({ mode: "none" })}
                className={`${cardBase} ${pastSel.mode === "none" ? cardSel : cardUnsel}`}
              >
                <p className="text-[10px] font-black uppercase tracking-wider text-violet-600">Pastpaper</p>
                <p className="text-sm font-bold text-slate-800 mt-1">No practice test</p>
                <p className="text-xs text-slate-500 mt-0.5">Assignment without a linked pastpaper</p>
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
                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-600">Practice test</p>
                    <p className="text-xs font-bold text-slate-400 mt-1">{formatLineDate(lineDate)}</p>
                    <p className="text-sm font-bold text-slate-900 mt-2 line-clamp-2 leading-snug">{heading}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {sectionRows.map((t) => (
                        <span
                          key={t.id}
                          className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-lg bg-violet-100 text-violet-800"
                        >
                          {subjectLabel(t.subject)}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">File (optional)</label>
            <input
              type="file"
              onChange={(e) => setAsgFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newAsg.title.trim() || creatingAsg}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {creatingAsg ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
