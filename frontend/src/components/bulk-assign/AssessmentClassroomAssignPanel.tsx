"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assessmentsAdminApi, classesApi } from "@/lib/api";
import { getSubject } from "@/lib/permissions";

const INPUT = "input-modern";
const BTN_PRIMARY = "btn-primary text-xs";
const BTN_GHOST = "btn-secondary text-xs !px-3 !py-2";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}

function normalizeClassroomSubject(raw: unknown): "math" | "english" | null {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (u === "MATH") return "math";
  if (u === "ENGLISH") return "english";
  return null;
}

export type AssessmentClassroomAssignPanelProps = {
  canAssign: boolean;
  showToast: (msg: string) => void;
};

/**
 * Classroom homework assignment for LMS assessment sets (same API as /assessments/homework/assign/).
 * Used from Assignments tab on admin.* and from Assessments tab on questions.*.
 */
export function AssessmentClassroomAssignPanel({ canAssign, showToast }: AssessmentClassroomAssignPanelProps) {
  const [sets, setSets] = useState<any[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setId, setSetId] = useState<number | null>(null);

  const [classrooms, setClassrooms] = useState<any[] | null>(null);
  const [classroomLoading, setClassroomLoading] = useState(false);
  const [classroomId, setClassroomId] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [dupAssignmentId, setDupAssignmentId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const idempotencyRef = useRef<string | null>(null);

  const fetchSets = useCallback(async () => {
    setSetsLoading(true);
    try {
      const dom = getSubject();
      const data = await assessmentsAdminApi.adminListSets(dom ? { subject: dom } : undefined);
      setSets(Array.isArray(data) ? data : []);
    } catch {
      setSets([]);
      showToast("Could not load assessment sets.");
    } finally {
      setSetsLoading(false);
    }
  }, [showToast]);

  const loadClassrooms = useCallback(async () => {
    setClassroomLoading(true);
    try {
      const all = await classesApi.list();
      setClassrooms(Array.isArray(all) ? all : []);
    } catch (e: unknown) {
      setClassrooms([]);
      const ax = e as { response?: { status?: number; data?: { detail?: string } } };
      const detail = ax?.response?.data?.detail;
      const st = ax?.response?.status;
      const suffix =
        typeof detail === "string" && detail.trim()
          ? ` ${detail.trim()}`
          : st != null
            ? ` (HTTP ${st})`
            : "";
      showToast(`Could not load classrooms.${suffix}`);
    } finally {
      setClassroomLoading(false);
    }
  }, [showToast]);

  const loadDupGuard = useCallback(async (cid: number, sid: number | null) => {
    setDupAssignmentId(null);
    if (!cid || !sid) return;
    try {
      const rows = await classesApi.listAssignments(cid);
      const list = Array.isArray(rows) ? rows : [];
      const hit = list.find((a: any) => Number(a?.assessment_homework?.set?.id) === Number(sid));
      if (hit?.id) setDupAssignmentId(Number(hit.id));
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    if (!canAssign) return;
    void fetchSets();
    void loadClassrooms();
  }, [canAssign, fetchSets, loadClassrooms]);

  useEffect(() => {
    idempotencyRef.current = null;
  }, [classroomId, setId]);

  useEffect(() => {
    if (!classroomId || !setId) {
      setDupAssignmentId(null);
      return;
    }
    void loadDupGuard(classroomId, setId);
  }, [classroomId, setId, loadDupGuard]);

  const selectedClassroom = useMemo(
    () => (classrooms || []).find((c: any) => Number(c.id) === Number(classroomId)) ?? null,
    [classrooms, classroomId],
  );

  const selectedSet = useMemo(() => sets.find((s: any) => Number(s.id) === Number(setId)) ?? null, [sets, setId]);

  const canSubmit = useMemo(() => {
    if (!canAssign) return false;
    if (!classroomId || !setId) return false;
    const cSub = normalizeClassroomSubject(selectedClassroom?.subject);
    const sSub = selectedSet?.subject as string | undefined;
    if (cSub && sSub && cSub !== sSub) return false;
    if (dupAssignmentId) return false;
    return true;
  }, [canAssign, classroomId, setId, selectedClassroom, selectedSet, dupAssignmentId]);

  const handleAssign = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setStatusMsg(null);
    const idempotencyKey =
      idempotencyRef.current ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    idempotencyRef.current = idempotencyKey;
    try {
      await assessmentsAdminApi.assignHomework(
        {
          classroom_id: classroomId!,
          set_id: setId!,
          title: title.trim() || undefined,
          instructions: instructions.trim() || undefined,
          due_at: due ? new Date(due).toISOString() : null,
        },
        idempotencyKey,
      );
      idempotencyRef.current = null;
      setStatusMsg("Assigned successfully.");
      showToast("Assessment assigned");
      await loadDupGuard(classroomId!, setId);
    } catch (e: any) {
      const st = e?.response?.status;
      const d = e?.response?.data;
      const msg = d?.detail || d?.message || e?.message || "Assign failed";
      showToast(String(msg));
      if (st === 409 || st === 400) void loadDupGuard(classroomId!, setId);
      if (st >= 400 && st < 500 && st !== 409 && st !== 429) idempotencyRef.current = null;
    } finally {
      setSubmitting(false);
    }
  };

  if (!canAssign) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Assessment homework assignment requires <span className="font-bold">assign access</span>.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-slate-400">Assessment homework</p>
          <p className="mt-1 text-xs text-slate-500">
            Assign an LMS assessment set to a classroom (same flow as pastpaper/mock access grants, but creates a homework row on the class).
          </p>
        </div>
        <button type="button" className={BTN_GHOST} onClick={() => void fetchSets()}>
          Refresh sets
        </button>
      </div>

      {setsLoading || classroomLoading ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Assessment set">
          <select
            className={INPUT}
            value={setId ? String(setId) : ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              setSetId(Number.isFinite(n) ? n : null);
            }}
          >
            <option value="">Select set…</option>
            {sets.map((s: any) => (
              <option key={s.id} value={String(s.id)}>
                #{s.id} · {String(s.title || "")} · {String(s.subject || "")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Classroom">
          <select
            className={INPUT}
            value={classroomId ? String(classroomId) : ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              setClassroomId(Number.isFinite(n) ? n : null);
            }}
          >
            <option value="">Select classroom…</option>
            {(classrooms || []).map((c: any) => (
              <option key={c.id} value={String(c.id)}>
                #{c.id} · {String(c.name || "Class")} · {String(c.subject || "").toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due at (optional)">
          <input className={INPUT} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Title override (optional)">
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Instructions (optional)">
          <textarea className={`${INPUT} min-h-[90px]`} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </Field>
      </div>

      {dupAssignmentId ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This classroom already has an assignment linked to this assessment set (assignment #{dupAssignmentId}). The server may still reject duplicates.
        </div>
      ) : null}

      {statusMsg ? <p className="mt-3 text-xs font-bold text-emerald-700">{statusMsg}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={!canSubmit || submitting} onClick={() => void handleAssign()}>
          {submitting ? "Assigning…" : "Assign assessment to classroom"}
        </button>
        {!canSubmit ? (
          <p className="text-xs font-semibold text-slate-500">
            Pick classroom + set, resolve subject mismatch, and clear duplicate warnings to enable.
          </p>
        ) : null}
      </div>
    </div>
  );
}
