"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import { subjectLabel } from "@/lib/practiceTestCards";
import { ArrowLeft, ClipboardCheck, ExternalLink, Save, Send, Trophy } from "lucide-react";

export default function AssignmentDetailPage() {
  const router = useRouter();
  const { classId, assignmentId } = useParams();
  const cid = Number(classId);
  const aid = Number(assignmentId);
  const [classMeta, setClassMeta] = useState<{ my_role?: string } | null>(null);
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
      const clsList = await classesApi.list();
      const cls = Array.isArray(clsList) ? clsList.find((c) => Number(c.id) === cid) : null;
      setClassMeta(cls || {});

      const list = await classesApi.listAssignments(cid);
      const found = Array.isArray(list) ? list.find((a) => Number(a.id) === aid) : null;
      setAssignment(found || { id: aid });
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
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not load assignment.");
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
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not submit.");
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

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between gap-4 mb-8">
        <Link href={`/classes/${cid}`} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Back to class
        </Link>
      </div>

      {error && <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm">{error}</div>}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 flex justify-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Assignment</p>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{assignment?.title || "Assignment"}</h1>
              {assignment?.instructions ? <p className="text-slate-600 mt-3 whitespace-pre-wrap">{assignment.instructions}</p> : null}
              <div className="mt-5 flex flex-wrap gap-2">
                {assignment?.mock_exam ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/mock/${assignment.mock_exam}`)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm hover:bg-slate-50"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open mock exam
                  </button>
                ) : null}
                {hasPastpaperBundle
                  ? bundleTests.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => router.push(`/practice-test/${t.id}`)}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm text-white ${
                          t.subject === "MATH"
                            ? "border-emerald-600 bg-emerald-600 hover:bg-emerald-700"
                            : "border-blue-600 bg-blue-600 hover:bg-blue-700"
                        }`}
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open {subjectLabel(t.subject)}
                      </button>
                    ))
                  : null}
                {!hasPastpaperBundle && legacyPracticeTestId ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/practice-test/${legacyPracticeTestId}`)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-200 bg-violet-600 text-white font-bold text-sm hover:bg-violet-700"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open practice test
                  </button>
                ) : null}
                {assignment?.external_url ? (
                  <button
                    type="button"
                    onClick={openExternal}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm hover:bg-slate-50"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open link
                  </button>
                ) : null}
                {homeworkAttachmentUrls.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm hover:bg-slate-50"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {homeworkAttachmentUrls.length > 1 ? `Open file ${i + 1}` : "Open attached file"}
                  </button>
                ))}
              </div>
            </div>

            {!isClassAdmin && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Your submission</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Attempt ID (optional)</label>
                    <input
                      value={attemptId}
                      onChange={(e) => setAttemptId(e.target.value)}
                      placeholder="e.g. 123"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white placeholder:text-slate-400"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">If you completed an exam attempt, paste its ID.</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Response</label>
                    <textarea
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      placeholder="Write your response here…"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm min-h-[120px] text-slate-900 bg-white placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Upload file (optional)</label>
                  <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="w-full text-sm" />
                  {mySubmission?.upload_file_url && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Existing file:{" "}
                      <a className="text-blue-700 font-semibold hover:underline" href={mySubmission.upload_file_url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => submit(false)}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    Save draft
                  </button>
                  <button
                    type="button"
                    onClick={() => submit(true)}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Send className="w-4 h-4" />
                    Submit
                  </button>
                </div>

                {mySubmission?.grade ? (
                  <div className="mt-5 p-4 rounded-2xl border border-emerald-200 bg-emerald-50">
                    <div className="flex items-center gap-2 text-emerald-800 font-black text-sm">
                      <Trophy className="w-4 h-4" /> Graded
                    </div>
                    <p className="text-emerald-900 font-extrabold text-xl mt-1">
                      {mySubmission.grade.score ?? "—"}
                    </p>
                    {mySubmission.grade.feedback ? <p className="text-emerald-800 mt-2">{mySubmission.grade.feedback}</p> : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Status</p>
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-sm">
                <ClipboardCheck className="w-4 h-4" />
                {mySubmission?.status || "Not submitted"}
              </div>
            </div>

            {isClassAdmin && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Submissions & grading</p>
                {submissions.length === 0 ? (
                  <p className="text-slate-600 text-sm">No submissions yet.</p>
                ) : (
                  <div className="space-y-4">
                    {submissions.map((s) => (
                      <div key={s.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                        <p className="font-bold text-slate-900 text-sm">
                          {s.student?.first_name || s.student?.email} {s.student?.last_name || ""}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.status}</p>
                        {s.text_response ? <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{s.text_response}</p> : null}
                        {s.attempt != null ? (
                          <p className="text-xs text-indigo-600 font-semibold mt-1">Attempt ID: {s.attempt}</p>
                        ) : null}
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <input
                            value={grading[String(s.id)]?.score ?? (s.grade?.score ?? "")}
                            onChange={(e) => setGrading((p) => ({ ...p, [String(s.id)]: { ...(p[String(s.id)] || {}), score: e.target.value } }))}
                            placeholder="Score"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold bg-white"
                          />
                          <input
                            value={grading[String(s.id)]?.feedback ?? (s.grade?.feedback ?? "")}
                            onChange={(e) => setGrading((p) => ({ ...p, [String(s.id)]: { ...(p[String(s.id)] || {}), feedback: e.target.value } }))}
                            placeholder="Feedback"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => gradeOne(s.id)}
                          className="w-full mt-2 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800"
                        >
                          Save grade
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

