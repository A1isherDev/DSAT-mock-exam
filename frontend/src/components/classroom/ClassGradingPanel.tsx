"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { classesApi } from "@/lib/api";
import { crInputClass } from "@/components/classroom";
import HomeworkFilePreviewTile from "@/components/classroom/HomeworkFilePreviewTile";
import { fileNameFromUrl } from "@/lib/homeworkFileDisplay";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  RotateCcw,
  Trophy,
  User,
} from "lucide-react";
import { useAuthCriticalGate } from "@/hooks/useAuthCriticalGate";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Assignment = {
  id: number;
  title: string;
  due_at?: string | null;
  submissions_count?: number;
  workflow_state?: string | null;
};

type Member = {
  role: string;
  user: { id: number; email?: string; first_name?: string; last_name?: string };
};

function studentLabel(u: Member["user"]) {
  const n = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  return n || u.email || `User #${u.id}`;
}

function isTurnedIn(status: string | undefined) {
  return status === "SUBMITTED" || status === "REVIEWED";
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ClassGradingPanel({
  classId,
  assignments,
  people,
}: {
  classId: number;
  assignments: Assignment[];
  people: Member[];
}) {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);

  const selectedAssignment = assignments.find((a) => a.id === selectedAssignmentId) ?? null;

  if (selectedAssignment) {
    return (
      <AssignmentGradingView
        classId={classId}
        assignment={selectedAssignment}
        people={people}
        onBack={() => setSelectedAssignmentId(null)}
      />
    );
  }

  return (
    <AssignmentList
      assignments={assignments}
      onSelect={(id) => setSelectedAssignmentId(id)}
    />
  );
}

// ─── Assignment list ───────────────────────────────────────────────────────────

function AssignmentList({
  assignments,
  onSelect,
}: {
  assignments: Assignment[];
  onSelect: (id: number) => void;
}) {
  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
        <p className="font-bold text-foreground">No assignments to grade</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create assignments first, then students' submissions will appear here for grading.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <p className="font-bold text-foreground">All assignments</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Select an assignment to view student submissions and enter grades.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {assignments.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onSelect(a.id)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-foreground truncate">{a.title || `Assignment #${a.id}`}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.due_at
                    ? `Due ${new Date(a.due_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                    : "No deadline"}
                  {typeof a.submissions_count === "number" && (
                    <span className="ml-2 font-medium">
                      · {a.submissions_count} submitted
                    </span>
                  )}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Assignment grading view (students + grading form) ─────────────────────────

function AssignmentGradingView({
  classId,
  assignment,
  people,
  onBack,
}: {
  classId: number;
  assignment: Assignment;
  people: Member[];
  onBack: () => void;
}) {
  const { assertCriticalAuth, criticalAuthReady } = useAuthCriticalGate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const [gradeDraft, setGradeDraft] = useState({ grade: "", feedback: "" });
  const [returnNote, setReturnNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const subs = await classesApi.listSubmissions(classId, assignment.id);
      setSubmissions(Array.isArray(subs) ? subs : []);
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not load submissions.");
    } finally {
      setLoading(false);
    }
  }, [classId, assignment.id]);

  useEffect(() => {
    load();
  }, [load]);

  const byUserId = useMemo(() => {
    const m = new Map<number, any>();
    for (const s of submissions) {
      const uid = s.student?.id ?? s.student_id;
      if (typeof uid === "number") m.set(uid, s);
    }
    return m;
  }, [submissions]);

  const { turnedIn, notTurnedIn } = useMemo(() => {
    const students = people.filter((p) => p.role === "STUDENT");
    const ti: { user: Member["user"]; sub: any }[] = [];
    const nt: { user: Member["user"]; sub: any | null }[] = [];
    for (const m of students) {
      const uid = m.user.id;
      const sub = byUserId.get(uid) ?? null;
      const st = sub?.status as string | undefined;
      if (isTurnedIn(st)) {
        ti.push({ user: m.user, sub });
      } else {
        nt.push({ user: m.user, sub });
      }
    }
    const sortUser = (a: { user: Member["user"] }, b: { user: Member["user"] }) =>
      studentLabel(a.user).localeCompare(studentLabel(b.user));
    ti.sort(sortUser);
    nt.sort(sortUser);
    return { turnedIn: ti, notTurnedIn: nt };
  }, [people, byUserId]);

  const selectedSub = useMemo(() => {
    if (selectedUserId == null) return null;
    return byUserId.get(selectedUserId) ?? null;
  }, [selectedUserId, byUserId]);

  useEffect(() => {
    if (!selectedSub) {
      setGradeDraft({ grade: "", feedback: "" });
      setReturnNote("");
      return;
    }
    const r = selectedSub.review;
    setGradeDraft({
      grade: r?.grade != null ? String(r.grade) : "",
      feedback: typeof r?.feedback === "string" ? r.feedback : "",
    });
    setReturnNote("");
  }, [selectedSub?.id, selectedSub?.revision, selectedSub]);

  const saveGrade = async () => {
    if (!selectedSub?.id) return;
    if (!assertCriticalAuth()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await classesApi.gradeSubmission(Number(selectedSub.id), {
        grade: gradeDraft.grade === "" ? null : gradeDraft.grade,
        feedback: gradeDraft.feedback ?? "",
        ...(typeof selectedSub.revision === "number" ? { expected_revision: selectedSub.revision } : {}),
      });
      setSuccess("Grade saved.");
      window.setTimeout(() => setSuccess(null), 4000);
      await load();
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { detail?: string } } };
      if (ax.response?.status === 409) {
        setError("Submission changed. Refreshed.");
        await load();
        return;
      }
      const d = ax.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not save grade.");
    } finally {
      setSaving(false);
    }
  };

  const doReturn = async () => {
    if (!selectedSub?.id) return;
    if (!assertCriticalAuth()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await classesApi.returnSubmission(Number(selectedSub.id), {
        ...(returnNote.trim() ? { note: returnNote.trim() } : {}),
        ...(typeof selectedSub.revision === "number" ? { expected_revision: selectedSub.revision } : {}),
      });
      setSuccess("Returned to student for revision.");
      window.setTimeout(() => setSuccess(null), 4000);
      await load();
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { detail?: string } } };
      if (ax.response?.status === 409) {
        setError("Submission changed. Refreshed.");
        await load();
        return;
      }
      const d = ax.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not return.");
    } finally {
      setSaving(false);
    }
  };

  const canGrade =
    selectedSub && (selectedSub.status === "SUBMITTED" || selectedSub.status === "REVIEWED");

  return (
    <div className="space-y-4">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          All assignments
        </button>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Grading</p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight text-foreground">
          {assignment.title || `Assignment #${assignment.id}`}
        </h2>

        {/* Summary */}
        {!loading && !error && (turnedIn.length > 0 || notTurnedIn.length > 0) && (() => {
          const unreviewed = turnedIn.filter(({ sub }) => sub?.status === "SUBMITTED").length;
          const allDone = unreviewed === 0 && turnedIn.length > 0 && notTurnedIn.length === 0;
          if (allDone) return (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">All reviewed. Nothing outstanding.</p>
            </div>
          );
          if (unreviewed > 0) return (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
              <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-semibold text-foreground">
                {unreviewed} submission{unreviewed === 1 ? "" : "s"} waiting for review
                {notTurnedIn.length > 0 ? ` · ${notTurnedIn.length} not submitted` : ""}
              </p>
            </div>
          );
          return null;
        })()}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Students list */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                <ClipboardCheck className="h-4 w-4" />
                Submitted ({turnedIn.length})
              </h3>
              <ul className="mt-3 max-h-[min(40vh,320px)] space-y-1 overflow-y-auto">
                {turnedIn.length === 0 ? (
                  <li className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">No submissions yet.</li>
                ) : (
                  turnedIn.map(({ user, sub }) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                          selectedUserId === user.id
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-transparent hover:bg-surface-2"
                        }`}
                      >
                        <User className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="min-w-0 flex-1 truncate">{studentLabel(user)}</span>
                        {sub?.status === "REVIEWED" && (
                          <Trophy className="h-4 w-4 shrink-0 text-amber-600" />
                        )}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Not submitted ({notTurnedIn.length})
              </h3>
              <ul className="mt-3 max-h-[min(40vh,280px)] space-y-1 overflow-y-auto">
                {notTurnedIn.length === 0 ? (
                  <li className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted-foreground">Everyone submitted.</li>
                ) : (
                  notTurnedIn.map(({ user, sub }) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                          selectedUserId === user.id
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-transparent hover:bg-surface-2"
                        }`}
                      >
                        <User className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="min-w-0 flex-1 truncate">{studentLabel(user)}</span>
                        <span className="shrink-0 text-[10px] font-bold uppercase text-muted-foreground">
                          {sub?.status || "—"}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          {/* Student work + grading form */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              {selectedUserId == null ? (
                <div className="text-center py-8">
                  <User className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-semibold text-foreground">Select a student</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Click on a student to view their submission and enter grades.
                  </p>
                </div>
              ) : !selectedSub ? (
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {studentLabel(people.find((p) => p.user.id === selectedUserId)?.user || { id: selectedUserId })}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">No submission record yet.</p>
                </div>
              ) : (
                <>
                  {/* Student header */}
                  <div className="border-b border-border pb-4">
                    <p className="text-lg font-bold text-foreground">
                      {studentLabel(
                        selectedSub.student || people.find((p) => p.user.id === selectedUserId)?.user || { id: selectedUserId },
                      )}
                    </p>
                    <p className="mt-1 text-sm font-medium text-muted-foreground">
                      Status: <span className="font-bold text-foreground">{selectedSub.status}</span>
                    </p>
                  </div>

                  {/* Uploaded files */}
                  <div className="mt-5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Uploaded files</h4>
                    {(Array.isArray(selectedSub.files) ? selectedSub.files : []).length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">No files uploaded.</p>
                    ) : (
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {(selectedSub.files as { id: number; url: string; file_name?: string; file_type?: string }[]).map((f) => {
                          const label = (f.file_name || fileNameFromUrl(f.url) || "File").trim() || "File";
                          return (
                            <HomeworkFilePreviewTile
                              key={f.id}
                              name={label}
                              remoteUrl={f.url}
                              href={f.url}
                              fileType={f.file_type}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Linked test attempt */}
                  <div className="mt-5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Practice test / Assessment</h4>
                    {selectedSub.attempt == null ? (
                      <p className="mt-2 text-sm text-muted-foreground">No linked test attempt.</p>
                    ) : (
                      <div className="mt-2 rounded-xl border border-border bg-surface-2/80 px-4 py-3 text-sm">
                        <p className="font-semibold text-foreground">
                          {(selectedSub.attempt as any).practice_test_name || "Practice test"}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Attempt #{(selectedSub.attempt as any).id}
                          {(selectedSub.attempt as any).is_completed ? " · Completed" : " · In progress"}
                          {(selectedSub.attempt as any).score != null && (
                            <span className="font-bold text-foreground">
                              {" · Score "}
                              {(selectedSub.attempt as any).score}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Grading form */}
                  {canGrade ? (
                    <div className="mt-6 space-y-4 border-t border-border pt-5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Grade & feedback</h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground">Score / grade</label>
                          <input
                            className={`${crInputClass} mt-1 w-full`}
                            value={gradeDraft.grade}
                            onChange={(e) => setGradeDraft((p) => ({ ...p, grade: e.target.value }))}
                            placeholder="e.g. 95"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-semibold text-muted-foreground">Feedback</label>
                          <textarea
                            className={`${crInputClass} mt-1 min-h-[96px] w-full resize-y`}
                            value={gradeDraft.feedback}
                            onChange={(e) => setGradeDraft((p) => ({ ...p, feedback: e.target.value }))}
                            placeholder="Comments for the student"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={saving || !criticalAuthReady}
                        onClick={() => void saveGrade()}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors sm:w-auto disabled:opacity-50"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save grade
                      </button>

                      {/* Return for revision */}
                      <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-4 dark:border-violet-900/40 dark:bg-violet-950/20">
                        <p className="text-xs font-bold uppercase tracking-wide text-violet-900 dark:text-violet-200">
                          Return for revision
                        </p>
                        <textarea
                          className={`${crInputClass} mt-2 min-h-[72px] w-full resize-y`}
                          value={returnNote}
                          onChange={(e) => setReturnNote(e.target.value)}
                          placeholder="Optional note for the student"
                        />
                        <button
                          type="button"
                          disabled={saving || !criticalAuthReady}
                          onClick={() => void doReturn()}
                          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300 bg-card px-4 py-2.5 text-sm font-bold text-violet-900 hover:bg-violet-100/80 dark:border-violet-800 dark:text-violet-100 dark:hover:bg-violet-900/40 sm:w-auto"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Return to student
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-6 text-sm text-muted-foreground border-t border-border pt-5">
                      Grading is available after the student submits (status: SUBMITTED or REVIEWED).
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
