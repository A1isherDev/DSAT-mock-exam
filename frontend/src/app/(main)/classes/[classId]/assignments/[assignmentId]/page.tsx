"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import { subjectLabel } from "@/lib/practiceTestCards";
import {
  ClassroomAlert,
  ClassroomButton,
  ClassroomCard,
  ClassroomEmptyState,
  ClassroomField,
  ClassroomPageHeader,
  ClassroomSkeleton,
  crInputClass,
} from "@/components/classroom";
import { ArrowLeft, ClipboardCheck, ExternalLink, FileQuestion, Save, Send, Trophy } from "lucide-react";

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
  const [responseText, setResponseText] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [attemptId, setAttemptId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [grading, setGrading] = useState<Record<string, { score?: string; feedback?: string }>>({});

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
      setResponseText(sub?.text_response || "");
      setAttemptId(sub?.attempt != null ? String(sub.attempt) : "");

      if (cls?.my_role === "ADMIN") {
        const subs = await classesApi.listSubmissions(cid, aid);
        setSubmissions(Array.isArray(subs) ? subs : []);
      } else {
        setSubmissions([]);
      }
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not load assignment.");
      setAssignment(null);
    } finally {
      setLoading(false);
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
    try {
      const fd = new FormData();
      fd.append("text_response", responseText);
      fd.append("submit", finalSubmit ? "true" : "false");
      if (attemptId.trim()) fd.append("attempt_id", String(Number(attemptId.trim())));
      if (uploadFile) fd.append("upload_file", uploadFile);
      const res = await classesApi.submitAssignment(cid, aid, fd as any);
      setMySubmission(res);
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Could not submit.");
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

  const bundleTests: { id: number; subject: string; title?: string }[] = Array.isArray(assignment?.practice_bundle_tests)
    ? assignment.practice_bundle_tests
    : [];
  const hasPastpaperBundle = bundleTests.length > 0;
  const legacyPracticeTestId = assignment?.practice_test;

  const gradeOne = async (submissionId: number) => {
    const g = grading[String(submissionId)] || {};
    await classesApi.gradeSubmission(submissionId, { score: g.score ?? null, feedback: g.feedback ?? "" });
    await refresh();
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
                            t.subject === "MATH" ? "ms-cta-math text-white" : "ms-cta-fill text-white"
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
                  {homeworkAttachmentUrls.map((url, i) => (
                    <button
                      key={`${url}-${i}`}
                      type="button"
                      onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                      className={`${linkBtn} border-border bg-card text-foreground hover:bg-surface-2`}
                    >
                      <ExternalLink className="h-4 w-4" />
                      {homeworkAttachmentUrls.length > 1 ? `File ${i + 1}` : "Attached file"}
                    </button>
                  ))}
                </div>
              </ClassroomCard>

              {!isClassAdmin && (
                <ClassroomCard padding="md">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Your submission
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <ClassroomField label="Attempt ID (optional)" htmlFor="attempt-id" hint="If you finished a test, link its attempt ID.">
                      <input
                        id="attempt-id"
                        value={attemptId}
                        onChange={(e) => setAttemptId(e.target.value)}
                        placeholder="e.g. 123"
                        className={`${crInputClass} font-semibold`}
                      />
                    </ClassroomField>
                    <ClassroomField label="Response" htmlFor="response-txt">
                      <textarea
                        id="response-txt"
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        placeholder="Write your response…"
                        rows={5}
                        className={crInputClass}
                      />
                    </ClassroomField>
                  </div>
                  <ClassroomField label="Upload file (optional)" htmlFor="sub-file" className="mt-4">
                    <input
                      id="sub-file"
                      type="file"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-500/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 dark:text-slate-400 dark:file:text-indigo-200"
                    />
                    {mySubmission?.upload_file_url ? (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Existing:{" "}
                        <a
                          className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                          href={mySubmission.upload_file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      </p>
                    ) : null}
                  </ClassroomField>

                  <div className="mt-6 flex flex-wrap gap-2">
                    <ClassroomButton variant="secondary" size="md" onClick={() => submit(false)} disabled={saving}>
                      <Save className="h-4 w-4" />
                      Save draft
                    </ClassroomButton>
                    <ClassroomButton variant="primary" size="md" onClick={() => submit(true)} disabled={saving}>
                      <Send className="h-4 w-4" />
                      Submit
                    </ClassroomButton>
                  </div>

                  {mySubmission?.grade ? (
                    <div className="mt-6 rounded-xl border border-emerald-200/90 bg-emerald-50/90 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                      <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-200">
                        <Trophy className="h-4 w-4" /> Graded
                      </div>
                      <p className="mt-2 text-2xl font-extrabold text-emerald-900 dark:text-emerald-100">
                        {mySubmission.grade.score ?? "—"}
                      </p>
                      {mySubmission.grade.feedback ? (
                        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">{mySubmission.grade.feedback}</p>
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
                          {s.text_response ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{s.text_response}</p>
                          ) : null}
                          {s.attempt != null ? (
                            <p className="mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">Attempt ID: {s.attempt}</p>
                          ) : null}
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              value={grading[String(s.id)]?.score ?? (s.grade?.score ?? "")}
                              onChange={(e) =>
                                setGrading((p) => ({
                                  ...p,
                                  [String(s.id)]: { ...(p[String(s.id)] || {}), score: e.target.value },
                                }))
                              }
                              placeholder="Score"
                              className={crInputClass}
                            />
                            <input
                              value={grading[String(s.id)]?.feedback ?? (s.grade?.feedback ?? "")}
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
                            Save grade
                          </ClassroomButton>
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
