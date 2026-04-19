"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { classesApi, examsApi } from "@/lib/api";
import { subjectLabel } from "@/lib/practiceTestCards";
import { platformSubjectIsMath } from "@/lib/permissions";
import {
  ClassroomAlert,
  ClassroomButton,
  ClassroomCard,
  ClassroomEmptyState,
  ClassroomField,
  ClassroomPageHeader,
  ClassroomSkeleton,
  crInputClass,
  crSelectClass,
} from "@/components/classroom";
import HomeworkFilePreviewTile from "@/components/classroom/HomeworkFilePreviewTile";
import { fileNameFromUrl } from "@/lib/homeworkFileDisplay";
import {
  ArrowLeft,
  ClipboardCheck,
  ExternalLink,
  FileImage,
  FileQuestion,
  FileText,
  History,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Trophy,
} from "lucide-react";

type BundleRow = { id: number; subject: string; title?: string };

function submissionAttemptPk(sub: { attempt?: unknown } | null | undefined): number | null {
  if (sub == null || sub.attempt == null) return null;
  const a = sub.attempt as { id?: unknown } | number;
  if (typeof a === "object" && a !== null && "id" in a) {
    const n = Number((a as { id: unknown }).id);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(a);
  return Number.isFinite(n) ? n : null;
}

function formatAttemptOption(a: { id: number; practice_test?: number; practice_test_details?: { subject?: string; title?: string }; is_completed?: boolean; score?: number | null; submitted_at?: string | null; started_at?: string | null }, bundleTests: BundleRow[]): string {
  const ptId = Number(a.practice_test);
  const bundle = bundleTests.find((t) => Number(t.id) === ptId);
  const details = a.practice_test_details || {};
  const title = (bundle?.title || details.title || "").trim();
  const head = title || `Section #${ptId}`;
  const sub = subjectLabel((details.subject || bundle?.subject || "READING_WRITING") as string);
  const status = a.is_completed
    ? `Completed${a.score != null ? ` · score ${a.score}` : ""}`
    : "In progress";
  return `#${a.id} · ${sub} · ${head} · ${status}`;
}

function fileKindIcon(fileType: string | undefined, fileName: string) {
  const ft = (fileType || "").toLowerCase();
  const fn = fileName.toLowerCase();
  if (ft.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(fn)) {
    return FileImage;
  }
  if (ft.includes("pdf") || fn.endsWith(".pdf")) {
    return FileText;
  }
  return FileText;
}

export default function AssignmentDetailPage() {
  const router = useRouter();
  const { classId, assignmentId } = useParams();
  const cid = Number(classId);
  const aid = Number(assignmentId);
  const [classMeta, setClassMeta] = useState<{ my_role?: string; name?: string } | null>(null);
  const isClassAdmin = classMeta?.my_role === "ADMIN";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [mySubmission, setMySubmission] = useState<any>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<number | null>(null);
  const [myAttempts, setMyAttempts] = useState<any[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptSearch, setAttemptSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [grading, setGrading] = useState<Record<string, { grade?: string; feedback?: string }>>({});
  const [returnDraft, setReturnDraft] = useState<Record<string, string>>({});
  const [returningId, setReturningId] = useState<number | null>(null);
  const [auditOpen, setAuditOpen] = useState<Record<string, boolean>>({});
  const [auditById, setAuditById] = useState<Record<number, any[] | undefined>>({});
  const [auditLoadingId, setAuditLoadingId] = useState<number | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const cls = await classesApi.get(cid);
      setClassMeta(cls);

      const list = await classesApi.listAssignments(cid);
      const found = Array.isArray(list) ? list.find((a) => Number(a.id) === aid) : null;
      setAssignment(found || null);
      const mine = await classesApi.getMySubmission(cid, aid);
      const sub = mine && typeof mine === "object" && "id" in mine && mine.id != null ? mine : null;
      setMySubmission(sub);
      setPendingFiles([]);
      setSelectedAttemptId(submissionAttemptPk(sub));

      if (cls?.my_role === "ADMIN") {
        setMyAttempts([]);
        const subs = await classesApi.listSubmissions(cid, aid);
        const list = Array.isArray(subs) ? subs : [];
        setSubmissions(list);
        setGrading((prev) => {
          const n = { ...prev };
          for (const s of list) {
            const id = String(s.id);
            if (!n[id] && s.review) {
              n[id] = {
                grade: s.review.grade != null ? String(s.review.grade) : "",
                feedback: s.review.feedback ?? "",
              };
            }
          }
          return n;
        });
      } else {
        setSubmissions([]);
        setAttemptsLoading(true);
        try {
          const att = await examsApi.getAttempts();
          setMyAttempts(Array.isArray(att) ? att : []);
        } catch {
          setMyAttempts([]);
        } finally {
          setAttemptsLoading(false);
        }
      }
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not load assignment.");
      setAssignment(null);
    } finally {
      setLoading(false);
    }
  };

  const refetchMySubmissionOnly = async () => {
    try {
      const mine = await classesApi.getMySubmission(cid, aid);
      const sub = mine && typeof mine === "object" && "id" in mine && mine.id != null ? mine : null;
      setMySubmission(sub);
      setSelectedAttemptId(submissionAttemptPk(sub));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!Number.isFinite(cid) || !Number.isFinite(aid)) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, aid]);

  const submit = async (finalSubmit: boolean) => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const fd = new FormData();
      fd.append("submit", finalSubmit ? "true" : "false");
      fd.append("attempt_id", selectedAttemptId != null ? String(selectedAttemptId) : "");
      if (mySubmission != null && typeof mySubmission.revision === "number") {
        fd.append("expected_revision", String(mySubmission.revision));
      }
      const tokens: string[] = [];
      for (const f of pendingFiles) {
        fd.append("files", f);
        tokens.push(crypto.randomUUID());
      }
      if (tokens.length) {
        fd.append("file_tokens", JSON.stringify(tokens));
      }
      const res = await classesApi.submitAssignment(cid, aid, fd as any);
      setMySubmission(res);
      setPendingFiles([]);
      setSelectedAttemptId(submissionAttemptPk(res));
      if (finalSubmit) {
        setSuccessMsg("Homework submitted successfully.");
        window.setTimeout(() => setSuccessMsg(null), 5000);
      }
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { detail?: string } } };
      if (ax.response?.status === 409) {
        setError(
          typeof ax.response.data?.detail === "string"
            ? ax.response.data.detail
            : "Submission changed. Try again after refreshing."
        );
        await refetchMySubmissionOnly();
        return;
      }
      const d = ax.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not submit.");
    } finally {
      setSaving(false);
    }
  };

  const removeServerFile = async (fileId: number) => {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("submit", "false");
      fd.append("remove_file_ids", JSON.stringify([fileId]));
      if (mySubmission != null && typeof mySubmission.revision === "number") {
        fd.append("expected_revision", String(mySubmission.revision));
      }
      const res = await classesApi.submitAssignment(cid, aid, fd as any);
      setMySubmission(res);
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { detail?: string } } };
      if (ax.response?.status === 409) {
        setError(
          typeof ax.response.data?.detail === "string"
            ? ax.response.data.detail
            : "Submission changed. Try again after refreshing."
        );
        await refetchMySubmissionOnly();
        return;
      }
      const d = ax.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not remove file.");
    } finally {
      setSaving(false);
    }
  };

  const openExternal = () => {
    if (!assignment?.external_url) return;
    const url = /^https?:\/\//i.test(assignment.external_url) ? assignment.external_url : `https://${assignment.external_url}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const homeworkAttachmentUrls: string[] = Array.isArray(assignment?.attachment_urls)
    ? assignment.attachment_urls.filter((u: unknown) => typeof u === "string")
    : assignment?.attachment_file_url
      ? [assignment.attachment_file_url]
      : [];

  const bundleTests: BundleRow[] = Array.isArray(assignment?.practice_bundle_tests)
    ? assignment.practice_bundle_tests
    : [];
  const hasPastpaperBundle = bundleTests.length > 0;
  const legacyPracticeTestId = assignment?.practice_test;
  /** Assigned practice/mock sections: turn-in is automatic when tests are completed — no file upload. */
  const locksFileUpload = Boolean(assignment?.locks_file_upload);

  const allowedPracticeTestIdSet = useMemo(() => {
    if (!bundleTests.length) return null;
    return new Set(bundleTests.map((t) => Number(t.id)).filter(Number.isFinite));
  }, [bundleTests]);

  const displayAttempts = useMemo(() => {
    const q = attemptSearch.trim().toLowerCase();
    let list = myAttempts;
    if (allowedPracticeTestIdSet) {
      list = list.filter((a) => allowedPracticeTestIdSet.has(Number(a.practice_test)));
    }
    if (q) {
      list = list.filter((a) => {
        const blob = `${formatAttemptOption(a, bundleTests)} ${a.id}`.toLowerCase();
        return blob.includes(q);
      });
    }
    list = [...list].sort((a, b) => {
      if (!!a.is_completed !== !!b.is_completed) return a.is_completed ? -1 : 1;
      const ta = new Date(String(a.submitted_at || a.started_at || "")).getTime() || 0;
      const tb = new Date(String(b.submitted_at || b.started_at || "")).getTime() || 0;
      if (tb !== ta) return tb - ta;
      return Number(b.id) - Number(a.id);
    });
    if (selectedAttemptId != null && !list.some((a) => Number(a.id) === selectedAttemptId)) {
      const one = myAttempts.find((a) => Number(a.id) === selectedAttemptId);
      if (one) return [one, ...list];
    }
    return list;
  }, [myAttempts, allowedPracticeTestIdSet, attemptSearch, bundleTests, selectedAttemptId]);

  const refetchAttempts = useCallback(async () => {
    if (isClassAdmin) return;
    setAttemptsLoading(true);
    try {
      const att = await examsApi.getAttempts();
      setMyAttempts(Array.isArray(att) ? att : []);
    } catch {
      setMyAttempts([]);
    } finally {
      setAttemptsLoading(false);
    }
  }, [isClassAdmin]);

  const gradeOne = async (submissionId: number) => {
    const g = grading[String(submissionId)] || {};
    setError(null);
    try {
      const row = submissions.find((s) => Number(s.id) === submissionId);
      await classesApi.gradeSubmission(submissionId, {
        grade: g.grade === "" || g.grade == null ? null : g.grade,
        feedback: g.feedback ?? "",
        ...(typeof row?.revision === "number" ? { expected_revision: row.revision } : {}),
      });
      await refresh();
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { detail?: string } } };
      if (ax.response?.status === 409) {
        setError(
          typeof ax.response.data?.detail === "string" ? ax.response.data.detail : "Submission changed. Refreshed."
        );
        await refresh();
        return;
      }
      const d = ax.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not save grade.");
    }
  };

  const returnOne = async (submissionId: number) => {
    const note = (returnDraft[String(submissionId)] ?? "").trim();
    setReturningId(submissionId);
    setError(null);
    try {
      const row = submissions.find((s) => Number(s.id) === submissionId);
      await classesApi.returnSubmission(submissionId, {
        ...(note ? { note } : {}),
        ...(typeof row?.revision === "number" ? { expected_revision: row.revision } : {}),
      });
      setSuccessMsg("Returned to student for revision.");
      window.setTimeout(() => setSuccessMsg(null), 5000);
      await refresh();
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { detail?: string } } };
      if (ax.response?.status === 409) {
        setError(
          typeof ax.response.data?.detail === "string" ? ax.response.data.detail : "Submission changed. Refreshed."
        );
        await refresh();
        return;
      }
      const d = ax.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not return submission.");
    } finally {
      setReturningId(null);
    }
  };

  const toggleAudit = async (submissionId: number) => {
    const key = String(submissionId);
    const willOpen = !auditOpen[key];
    setAuditOpen((p) => ({ ...p, [key]: willOpen }));
    if (!willOpen) return;
    if (auditById[submissionId] !== undefined || auditLoadingId === submissionId) return;
    setAuditLoadingId(submissionId);
    setError(null);
    try {
      const data = await classesApi.getSubmissionAuditLog(submissionId);
      const list = Array.isArray(data) ? data : [];
      setAuditById((p) => ({ ...p, [submissionId]: list }));
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not load activity.");
    } finally {
      setAuditLoadingId(null);
    }
  };

  const isBeforeAssignmentDeadline = useMemo(() => {
    const raw = assignment?.due_at;
    if (raw == null || raw === "") return true;
    const t = new Date(String(raw)).getTime();
    return Number.isFinite(t) && t >= Date.now();
  }, [assignment?.due_at]);

  /** Draft / returned always; submitted again only until due (matches backend). */
  const canEditSubmission = useMemo(() => {
    const st = mySubmission?.status;
    if (!st) return true;
    if (st === "DRAFT" || st === "RETURNED") return true;
    if (st === "SUBMITTED" && isBeforeAssignmentDeadline) return true;
    return false;
  }, [mySubmission?.status, isBeforeAssignmentDeadline]);

  const formatShortWhen = (iso?: string | null) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  const linkBtn =
    "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 cr-classroom-bg" aria-hidden />

      <Link
        href={`/classes/${cid}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:opacity-90"
      >
        <ArrowLeft className="h-4 w-4" /> Back to class
      </Link>

      {error ? (
        <div className="mb-6">
          <ClassroomAlert tone="error">{error}</ClassroomAlert>
        </div>
      ) : null}

      {successMsg ? (
        <div
          className="mb-6 rounded-xl border border-emerald-200/90 bg-emerald-50/90 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
          role="status"
        >
          {successMsg}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-6">
          <ClassroomSkeleton className="h-24 w-full max-w-xl rounded-2xl" />
          <ClassroomSkeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : !assignment ? (
        <ClassroomEmptyState
          icon={FileQuestion}
          title="Assignment not found"
          description="It may have been removed or you may not have access."
          action={{ label: "Back to class", onClick: () => router.push(`/classes/${cid}`) }}
        />
      ) : (
        <>
          <ClassroomPageHeader
            eyebrow="Assignment"
            title={assignment.title || "Homework"}
            meta={classMeta?.name ? <span>Class: {classMeta.name}</span> : null}
          />

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <ClassroomCard padding="md">
                {assignment.instructions ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {assignment.instructions}
                  </p>
                ) : (
                  <p className="text-sm text-label-foreground">No instructions provided.</p>
                )}
                <div className="mt-6 flex flex-wrap gap-2">
                  {assignment?.mock_exam ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/mock/${assignment.mock_exam}`)}
                      className={`${linkBtn} border-border bg-card text-foreground hover:border-primary/30 hover:bg-surface-2`}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open mock exam
                    </button>
                  ) : null}
                  {hasPastpaperBundle
                    ? bundleTests.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => router.push(`/practice-test/${t.id}`)}
                          className={`${linkBtn} ms-btn-primary border-transparent shadow-sm ${
                            platformSubjectIsMath(t.subject) ? "ms-cta-math text-white" : "ms-cta-fill text-white"
                          }`}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open {subjectLabel(t.subject)}
                        </button>
                      ))
                    : null}
                  {!hasPastpaperBundle && legacyPracticeTestId ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/practice-test/${legacyPracticeTestId}`)}
                      className={`${linkBtn} ms-btn-primary ms-cta-fill border-transparent text-white`}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open practice test
                    </button>
                  ) : null}
                  {assignment?.external_url ? (
                    <button
                      type="button"
                      onClick={openExternal}
                      className={`${linkBtn} border-border bg-card text-foreground hover:bg-surface-2`}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open link
                    </button>
                  ) : null}
                </div>
                {homeworkAttachmentUrls.length > 0 ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {homeworkAttachmentUrls.map((url, i) => {
                      const displayName = fileNameFromUrl(url);
                      return (
                        <HomeworkFilePreviewTile
                          key={`${url}-${i}`}
                          name={displayName}
                          remoteUrl={url}
                          href={url}
                          fileType={undefined}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </ClassroomCard>

              {!isClassAdmin && (
                <ClassroomCard padding="md">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Your submission
                      </p>
                      <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50">
                        {locksFileUpload ? "Assigned test completion" : "Turn in your work"}
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                        {locksFileUpload ? (
                          <>
                            Finish the assigned practice or mock sections using the buttons above. When every required
                            section is completed in the app, your homework is <strong>turned in automatically</strong> — you
                            do not upload files or attach the test here.
                          </>
                        ) : (
                          <>
                            Upload your files and/or link a practice test attempt. You can <strong>save a draft</strong> and
                            come back, or press <strong>Submit</strong> when you are finished.
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {locksFileUpload ? (
                    <ol className="mt-5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                      <li className="flex gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200">
                          1
                        </span>
                        <span>Read the instructions and any materials above.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200">
                          2
                        </span>
                        <span>Open each required section (English and/or Math if both are assigned) and complete it in the test player.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200">
                          3
                        </span>
                        <span>
                          Return here and tap <strong>Refresh status</strong> if the page does not update right away after you
                          finish.
                        </span>
                      </li>
                    </ol>
                  ) : (
                    <ol className="mt-5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                      <li className="flex gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200">
                          1
                        </span>
                        <span>Read the instructions and any attached files or practice links above.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200">
                          2
                        </span>
                        <span>Add one or more files (you can add more later). Each upload is kept — nothing is overwritten.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200">
                          3
                        </span>
                        <span>Optionally link a test attempt, then save or submit.</span>
                      </li>
                    </ol>
                  )}

                  {mySubmission?.status === "RETURNED" ? (
                    <div
                      className="mt-5 rounded-xl border border-violet-300/90 bg-violet-50/95 px-4 py-3 text-sm text-violet-950 shadow-sm dark:border-violet-800/80 dark:bg-violet-950/40 dark:text-violet-100"
                      role="status"
                    >
                      <p className="font-bold">Returned for revision</p>
                      {mySubmission.returned_at ? (
                        <p className="mt-1 text-xs font-medium text-violet-800/90 dark:text-violet-300/90">
                          {formatShortWhen(mySubmission.returned_at)}
                        </p>
                      ) : null}
                      {mySubmission.return_note ? (
                        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-violet-900 dark:text-violet-100/95">
                          {mySubmission.return_note}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-violet-800/80 dark:text-violet-300/80">
                          {locksFileUpload
                            ? "Complete the assigned tests again; your homework will update automatically when finished."
                            : "Update your files or attempt, then submit again."}
                        </p>
                      )}
                    </div>
                  ) : null}

                  {!canEditSubmission ? (
                    <div className="mt-5 rounded-xl border border-sky-200/90 bg-sky-50/90 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/35 dark:text-sky-100">
                      <p className="font-semibold">Submission locked</p>
                      <p className="mt-1 text-sky-900/90 dark:text-sky-200/90">
                        {mySubmission?.status === "REVIEWED"
                          ? locksFileUpload
                            ? "Your teacher has reviewed this homework. You can change it only if the work is returned for revision."
                            : "Your teacher has reviewed this submission. You can change files only if the work is returned for revision."
                          : mySubmission?.status === "SUBMITTED"
                            ? locksFileUpload
                              ? "The due date has passed. Your teacher can still see your completed test for this homework."
                              : "The due date has passed. You can no longer change this submission."
                            : `This copy is locked (${mySubmission?.status}). You cannot change files until work is returned for revision.`}
                      </p>
                    </div>
                  ) : null}

                  {locksFileUpload ? (
                    <div className="mt-6 space-y-4 rounded-2xl border border-emerald-200/90 bg-emerald-50/50 px-4 py-4 dark:border-emerald-900/40 dark:bg-emerald-950/25">
                      <p className="text-sm text-slate-700 dark:text-slate-200">
                        Your teacher sees this homework as turned in when the required test sections are completed in the app.
                        If you just finished, refresh this page to update the status below.
                      </p>
                      <ClassroomButton
                        type="button"
                        variant="secondary"
                        size="md"
                        disabled={saving}
                        onClick={() => void refresh()}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Refresh status
                      </ClassroomButton>
                      {mySubmission?.attempt != null && typeof mySubmission.attempt === "object" ? (
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          Linked attempt: #
                          {String((mySubmission.attempt as { id?: number }).id ?? "")}
                          {(mySubmission.attempt as { is_completed?: boolean }).is_completed ? " · Completed" : ""}
                          {(mySubmission.attempt as { score?: number | null }).score != null
                            ? ` · Score ${(mySubmission.attempt as { score?: number | null }).score}`
                            : ""}
                        </p>
                      ) : mySubmission?.status === "DRAFT" || !mySubmission?.status ? (
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                          Not turned in yet — finish every assigned section, then refresh.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {!locksFileUpload ? (
                    <>
                  <ClassroomField
                    label="Your files"
                    htmlFor="sub-files"
                    className="mt-6"
                    hint="PDF, images, or other documents. Multiple files allowed."
                  >
                    <input
                      id="sub-files"
                      type="file"
                      multiple
                      disabled={!canEditSubmission}
                      onChange={(e) => {
                        const list = e.target.files ? Array.from(e.target.files) : [];
                        setPendingFiles((p) => [...p, ...list]);
                        e.target.value = "";
                      }}
                      className="w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-500/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:file:text-indigo-200"
                    />
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {(Array.isArray(mySubmission?.files) ? mySubmission.files : []).map((f: { id: number; url: string; file_name?: string; file_type?: string }) => {
                        const label = (f.file_name || fileNameFromUrl(f.url) || "File").trim() || "File";
                        return (
                          <HomeworkFilePreviewTile
                            key={f.id}
                            name={label}
                            remoteUrl={f.url}
                            href={f.url}
                            fileType={f.file_type}
                            onRemove={() => void removeServerFile(f.id)}
                            removeDisabled={saving || !canEditSubmission}
                          />
                        );
                      })}
                      {pendingFiles.map((f, i) => (
                        <HomeworkFilePreviewTile
                          key={`pending-${i}-${f.name}-${f.size}`}
                          name={f.name}
                          localFile={f}
                          fileType={f.type}
                          badge="Not uploaded yet"
                          onRemove={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                          removeDisabled={!canEditSubmission}
                        />
                      ))}
                    </div>
                  </ClassroomField>

                  <div className="mt-6 rounded-2xl border border-slate-200/95 bg-white/80 p-4 dark:border-slate-600 dark:bg-slate-950/40">
                    <ClassroomField
                      label="Link a test attempt (if your teacher asked)"
                      htmlFor="attempt-select"
                      hint={
                        allowedPracticeTestIdSet
                          ? "Only attempts for the practice sections in this assignment are listed. Finish the test, then refresh the list."
                          : "Shows your recent attempts for any practice or mock section. Choose one if your teacher wants proof of completion."
                      }
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <input
                          id="attempt-search"
                          type="search"
                          value={attemptSearch}
                          onChange={(e) => setAttemptSearch(e.target.value)}
                          placeholder="Search by #id, subject, or title…"
                          autoComplete="off"
                          className={`${crInputClass} sm:min-w-[200px] sm:flex-1`}
                          aria-label="Filter test attempts"
                          disabled={!canEditSubmission}
                        />
                        <ClassroomButton
                          type="button"
                          variant="secondary"
                          size="md"
                          className="shrink-0"
                          disabled={attemptsLoading || !canEditSubmission}
                          onClick={() => void refetchAttempts()}
                        >
                          <RefreshCw className={`h-4 w-4 ${attemptsLoading ? "animate-spin" : ""}`} />
                          Refresh list
                        </ClassroomButton>
                      </div>
                      <select
                        id="attempt-select"
                        className={`${crSelectClass} mt-2 min-h-[2.75rem]`}
                        value={selectedAttemptId != null ? String(selectedAttemptId) : ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSelectedAttemptId(v === "" ? null : Number(v));
                        }}
                        disabled={(attemptsLoading && myAttempts.length === 0) || !canEditSubmission}
                      >
                        <option value="">Don&apos;t link a test attempt</option>
                        {displayAttempts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {formatAttemptOption(a, bundleTests)}
                          </option>
                        ))}
                      </select>
                      {!attemptsLoading && allowedPracticeTestIdSet && displayAttempts.length === 0 ? (
                        <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                          No attempts found for this assignment&apos;s tests yet. Open the practice or mock from the buttons
                          above, complete it, then tap <strong>Refresh list</strong>.
                        </p>
                      ) : null}
                      {!attemptsLoading && !allowedPracticeTestIdSet && myAttempts.length === 0 ? (
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                          No attempts on your account yet. When you start a practice or mock test, it will appear here after you
                          refresh.
                        </p>
                      ) : null}
                    </ClassroomField>
                  </div>

                  <div className="mt-6 flex flex-col gap-3 rounded-xl border border-dashed border-slate-200/90 bg-white/60 px-4 py-3 dark:border-slate-600 dark:bg-slate-950/30">
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <strong className="text-slate-800 dark:text-slate-200">Save draft</strong> keeps your work for later.
                      <strong className="ml-1 text-slate-800 dark:text-slate-200">Submit</strong> sends it to your teacher
                      (you can still save again after if allowed).
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <ClassroomButton variant="secondary" size="md" onClick={() => submit(false)} disabled={saving || !canEditSubmission}>
                        <Save className="h-4 w-4" />
                        Save draft
                      </ClassroomButton>
                      <ClassroomButton variant="primary" size="md" onClick={() => submit(true)} disabled={saving || !canEditSubmission}>
                        <Send className="h-4 w-4" />
                        Submit to teacher
                      </ClassroomButton>
                    </div>
                  </div>
                    </>
                  ) : null}

                  {mySubmission?.review ? (
                    <div
                      className={`mt-6 rounded-xl border p-4 ${
                        mySubmission.status === "RETURNED"
                          ? "border-violet-200/90 bg-violet-50/80 dark:border-violet-900/50 dark:bg-violet-950/25"
                          : "border-emerald-200/90 bg-emerald-50/90 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                      }`}
                    >
                      <div
                        className={`flex items-center gap-2 text-sm font-bold ${
                          mySubmission.status === "RETURNED"
                            ? "text-violet-900 dark:text-violet-200"
                            : "text-emerald-800 dark:text-emerald-200"
                        }`}
                      >
                        <Trophy className="h-4 w-4" />{" "}
                        {mySubmission.status === "RETURNED" ? "Previous review" : "Reviewed"}
                      </div>
                      <p
                        className={`mt-2 text-2xl font-extrabold ${
                          mySubmission.status === "RETURNED"
                            ? "text-violet-950 dark:text-violet-50"
                            : "text-emerald-900 dark:text-emerald-100"
                        }`}
                      >
                        {mySubmission.review.grade ?? "—"}
                      </p>
                      {mySubmission.review.feedback ? (
                        <p
                          className={`mt-2 text-sm ${
                            mySubmission.status === "RETURNED"
                              ? "text-violet-900/95 dark:text-violet-100/95"
                              : "text-emerald-800 dark:text-emerald-200"
                          }`}
                        >
                          {mySubmission.review.feedback}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </ClassroomCard>
              )}
            </div>

            <div className="space-y-6">
              <ClassroomCard padding="md">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-100">
                  <ClipboardCheck className="h-4 w-4 text-indigo-500" />
                  {mySubmission?.status || "Not submitted"}
                </div>
              </ClassroomCard>

              {isClassAdmin && (
                <ClassroomCard padding="md">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Submissions & grading
                  </p>
                  {submissions.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No submissions yet.</p>
                  ) : (
                    <ul className="mt-4 space-y-4">
                      {submissions.map((s) => (
                        <li
                          key={s.id}
                          className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-600/80 dark:bg-slate-800/40"
                        >
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
                            {s.student?.first_name || s.student?.email} {s.student?.last_name || ""}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{s.status}</p>
                          <ul className="mt-3 space-y-2">
                            {(Array.isArray(s.files) ? s.files : []).map((f: { id: number; url: string; file_name?: string; file_type?: string }) => {
                              const Icon = fileKindIcon(f.file_type, f.file_name || "");
                              const label = (f.file_name || "File").trim() || "File";
                              return (
                                <li key={f.id}>
                                  <a
                                    href={f.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex max-w-full items-center gap-2 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                                  >
                                    <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                                    <span className="truncate">{label}</span>
                                  </a>
                                </li>
                              );
                            })}
                          </ul>
                          {s.attempt != null ? (
                            <p className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                              Linked test:{" "}
                              {typeof s.attempt === "object" && s.attempt !== null && "practice_test_name" in s.attempt
                                ? String((s.attempt as { practice_test_name?: string }).practice_test_name)
                                : `Attempt #${s.attempt}`}
                            </p>
                          ) : null}
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              value={grading[String(s.id)]?.grade ?? (s.review?.grade ?? "")}
                              onChange={(e) =>
                                setGrading((p) => ({
                                  ...p,
                                  [String(s.id)]: { ...(p[String(s.id)] || {}), grade: e.target.value },
                                }))
                              }
                              placeholder="Score / grade"
                              className={crInputClass}
                            />
                            <input
                              value={grading[String(s.id)]?.feedback ?? (s.review?.feedback ?? "")}
                              onChange={(e) =>
                                setGrading((p) => ({
                                  ...p,
                                  [String(s.id)]: { ...(p[String(s.id)] || {}), feedback: e.target.value },
                                }))
                              }
                              placeholder="Feedback"
                              className={crInputClass}
                            />
                          </div>
                          <ClassroomButton variant="primary" size="sm" className="mt-3 w-full" onClick={() => gradeOne(s.id)}>
                            Save review
                          </ClassroomButton>
                          {(s.status === "SUBMITTED" || s.status === "REVIEWED") && (
                            <div className="mt-4 space-y-2 rounded-xl border border-violet-200/80 bg-white/80 p-3 dark:border-violet-900/50 dark:bg-slate-900/40">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-violet-800 dark:text-violet-200">
                                Return for revision
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                Student can edit files and resubmit. Optional note (shown to the student).
                              </p>
                              <textarea
                                value={returnDraft[String(s.id)] ?? ""}
                                onChange={(e) =>
                                  setReturnDraft((p) => ({ ...p, [String(s.id)]: e.target.value }))
                                }
                                placeholder="What should they change?"
                                rows={2}
                                className={`${crInputClass} min-h-[4rem] resize-y`}
                              />
                              <ClassroomButton
                                variant="secondary"
                                size="sm"
                                className="w-full"
                                disabled={returningId === s.id}
                                onClick={() => void returnOne(s.id)}
                              >
                                <RotateCcw className="h-4 w-4" />
                                Return to student
                              </ClassroomButton>
                            </div>
                          )}
                          <button
                            type="button"
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800"
                            onClick={() => void toggleAudit(s.id)}
                          >
                            <History className="h-3.5 w-3.5" />
                            {auditOpen[String(s.id)] ? "Hide activity" : "Activity log"}
                          </button>
                          {auditOpen[String(s.id)] ? (
                            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200/80 bg-white/90 p-2 text-xs dark:border-slate-600 dark:bg-slate-950/50">
                              {auditLoadingId === s.id ? (
                                <p className="p-2 text-slate-500">Loading…</p>
                              ) : (auditById[s.id] ?? []).length === 0 ? (
                                <p className="p-2 text-slate-500">No logged events yet.</p>
                              ) : (
                                <ul className="space-y-2">
                                  {(auditById[s.id] ?? []).map((ev: { id: number; event_type?: string; created_at?: string; actor_id?: number | null; payload?: unknown }) => (
                                    <li key={ev.id} className="rounded border border-slate-100/90 px-2 py-1.5 dark:border-slate-700/80">
                                      <span className="font-mono text-[10px] text-slate-500">
                                        {ev.created_at ? formatShortWhen(ev.created_at) : ""}
                                      </span>{" "}
                                      <span className="font-semibold text-slate-800 dark:text-slate-100">{ev.event_type}</span>
                                      {ev.actor_id != null ? (
                                        <span className="text-slate-500"> · actor {ev.actor_id}</span>
                                      ) : null}
                                      {ev.payload != null && typeof ev.payload === "object" ? (
                                        <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-all text-[10px] text-slate-600 dark:text-slate-400">
                                          {JSON.stringify(ev.payload)}
                                        </pre>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </ClassroomCard>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
