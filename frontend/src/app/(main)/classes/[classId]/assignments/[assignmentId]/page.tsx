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
  crTextareaClass,
} from "@/components/classroom";
import { ArrowLeft, ClipboardCheck, ExternalLink, FileQuestion, RefreshCw, Save, Send, Trophy } from "lucide-react";

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
  const [selectedAttemptId, setSelectedAttemptId] = useState<number | null>(null);
  const [myAttempts, setMyAttempts] = useState<any[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptSearch, setAttemptSearch] = useState("");
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
      setSelectedAttemptId(submissionAttemptPk(sub));

      if (cls?.my_role === "ADMIN") {
        setMyAttempts([]);
        const subs = await classesApi.listSubmissions(cid, aid);
        setSubmissions(Array.isArray(subs) ? subs : []);
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
      fd.append("attempt_id", selectedAttemptId != null ? String(selectedAttemptId) : "");
      if (uploadFile) fd.append("upload_file", uploadFile);
      const res = await classesApi.submitAssignment(cid, aid, fd as any);
      setMySubmission(res);
      setSelectedAttemptId(submissionAttemptPk(res));
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

  const bundleTests: BundleRow[] = Array.isArray(assignment?.practice_bundle_tests)
    ? assignment.practice_bundle_tests
    : [];
  const hasPastpaperBundle = bundleTests.length > 0;
  const legacyPracticeTestId = assignment?.practice_test;

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
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Your submission
                      </p>
                      <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50">Turn in your work</h3>
                      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                        Write your answer in the box below. You can <strong>save a draft</strong> and come back, or press{" "}
                        <strong>Submit</strong> when you are finished. If your teacher asked for a test attempt, add the ID in
                        the field — otherwise you can leave it blank.
                      </p>
                    </div>
                  </div>

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
                      <span>
                        Type your response clearly (use paragraphs; you can paste from a document). Aim to answer the
                        question directly and give examples or reasoning where it helps.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200">
                        3
                      </span>
                      <span>Optional: upload a file or link your test attempt below, then save or submit.</span>
                    </li>
                  </ol>

                  <div className="mt-6 rounded-2xl border border-slate-200/95 bg-slate-50/90 p-4 shadow-inner dark:border-slate-600 dark:bg-slate-900/40">
                    <ClassroomField
                      label="Your written response"
                      htmlFor="response-txt"
                      hint="This box has a solid background so your typing is always easy to read."
                    >
                      <textarea
                        id="response-txt"
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        placeholder={"Start typing here.\n\nTip: main idea → evidence → short conclusion."}
                        rows={10}
                        spellCheck
                        className={crTextareaClass}
                        aria-describedby="response-txt-counter"
                      />
                      <p id="response-txt-counter" className="mt-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                        {responseText.length.toLocaleString()} characters
                      </p>
                    </ClassroomField>
                  </div>

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
                        />
                        <ClassroomButton
                          type="button"
                          variant="secondary"
                          size="md"
                          className="shrink-0"
                          disabled={attemptsLoading}
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
                        disabled={attemptsLoading && myAttempts.length === 0}
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

                  <div className="mt-6 flex flex-col gap-3 rounded-xl border border-dashed border-slate-200/90 bg-white/60 px-4 py-3 dark:border-slate-600 dark:bg-slate-950/30">
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <strong className="text-slate-800 dark:text-slate-200">Save draft</strong> keeps your work for later.
                      <strong className="ml-1 text-slate-800 dark:text-slate-200">Submit</strong> sends it to your teacher
                      (you can still save again after if allowed).
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <ClassroomButton variant="secondary" size="md" onClick={() => submit(false)} disabled={saving}>
                        <Save className="h-4 w-4" />
                        Save draft
                      </ClassroomButton>
                      <ClassroomButton variant="primary" size="md" onClick={() => submit(true)} disabled={saving}>
                        <Send className="h-4 w-4" />
                        Submit to teacher
                      </ClassroomButton>
                    </div>
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
