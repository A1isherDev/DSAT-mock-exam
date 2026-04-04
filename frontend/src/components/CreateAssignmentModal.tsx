"use client";

import { useEffect, useState } from "react";
import { classesApi } from "@/lib/api";
import { Loader2, X } from "lucide-react";

type AssignmentOptMock = { id: number; title: string; practice_date: string | null; kind: string };
type AssignmentOptPt = {
  id: number;
  title: string;
  subject: string;
  label: string;
  practice_date: string | null;
};

function formatSubject(s?: string | null) {
  if (!s) return "Practice";
  if (s === "READING_WRITING") return "Reading & Writing";
  if (s === "MATH") return "Math";
  return s.replace(/_/g, " ");
}

type Props = {
  open: boolean;
  classId: number;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
};

export default function CreateAssignmentModal({ open, classId, onClose, onSuccess }: Props) {
  const [newAsg, setNewAsg] = useState({
    title: "",
    instructions: "",
    external_url: "",
    mock_exam: "",
    practice_test: "",
  });
  const [dueLocal, setDueLocal] = useState("");
  const [asgFile, setAsgFile] = useState<File | null>(null);
  const [assignmentOptions, setAssignmentOptions] = useState<{
    mock_exams: AssignmentOptMock[];
    practice_tests: AssignmentOptPt[];
  }>({ mock_exams: [], practice_tests: [] });
  const [asgOptionsLoading, setAsgOptionsLoading] = useState(false);
  const [asgOptionsError, setAsgOptionsError] = useState<string | null>(null);
  const [creatingAsg, setCreatingAsg] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setNewAsg({
      title: "",
      instructions: "",
      external_url: "",
      mock_exam: "",
      practice_test: "",
    });
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
      if (newAsg.practice_test) fd.append("practice_test", String(Number(newAsg.practice_test)));
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
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
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
            <strong>Mock</strong> is a timed diagnostic exam. <strong>Pastpaper</strong> links a full practice test (class
            leaderboard). All links are optional; title is required.
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
              Pastpaper (full test)
            </label>
            <p className="text-[11px] text-slate-500 mb-2">
              Pick a practice test card. Students complete the entire test, not a single section.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 max-h-[240px] overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => setNewAsg((p) => ({ ...p, practice_test: "" }))}
                className={`${cardBase} ${newAsg.practice_test === "" ? cardSel : cardUnsel}`}
              >
                <p className="text-sm font-bold text-slate-800">No practice test</p>
                <p className="text-xs text-slate-500 mt-0.5">Assignment without a linked pastpaper</p>
              </button>
              {assignmentOptions.practice_tests.map((pt) => {
                const selected = String(pt.id) === newAsg.practice_test;
                const meta = [formatSubject(pt.subject), pt.label?.trim() || null, pt.practice_date || null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() => setNewAsg((p) => ({ ...p, practice_test: String(pt.id) }))}
                    className={`${cardBase} ${selected ? cardSel : cardUnsel}`}
                  >
                    <p className="text-sm font-bold text-slate-900 line-clamp-2">{pt.title}</p>
                    {meta ? <p className="text-xs text-slate-500 mt-1 line-clamp-2">{meta}</p> : null}
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
