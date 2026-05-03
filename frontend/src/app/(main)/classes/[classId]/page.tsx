"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatLessonDaysMeta } from "@/lib/classroomSchedule";
import { subscribeRealtime } from "@/lib/realtime";
import ClassLeaderboard from "@/components/ClassLeaderboard";

function memberAvatarInitials(u: { first_name?: string; last_name?: string; email?: string }) {
  const a = (u.first_name?.trim()?.[0] || u.email?.trim()?.[0] || "?").toUpperCase();
  const b = (u.last_name?.trim()?.[0] || "").toUpperCase();
  return b ? `${a}${b}` : a;
}

/** Class assignment row from workspace serializer — assessments expose `assessment_homework`. */
function isAssessmentAssignmentRow(a: { assessment_homework?: unknown | null } | null | undefined): boolean {
  return a != null && a.assessment_homework != null;
}

function studentClassworkAssignmentHref(
  classId: number,
  assignment: { id: number; assessment_homework?: unknown | null },
): string {
  if (isAssessmentAssignmentRow(assignment)) return `/assessments/${assignment.id}`;
  return `/classes/${classId}/assignments/${assignment.id}`;
}

/**
 * Recently graded panel: submission rows have `submission_id`; auto-graded assessments only have
 * `assignment: { id, title }` plus `assessment_result` (no nested `assessment_homework`).
 */
function studentRecentlyGradedHref(
  classId: number,
  row: { assignment?: { id?: number }; submission_id?: number | null; assessment_result?: unknown },
): string {
  const aid = Number(row.assignment?.id);
  if (!Number.isFinite(aid)) return `/classes/${classId}`;
  if (row.assessment_result != null) return `/assessments/${aid}`;
  return `/classes/${classId}/assignments/${aid}`;
}
import CreateAssignmentModal from "@/components/CreateAssignmentModal";
import {
  ClassroomAlert,
  ClassroomButton,
  ClassroomCard,
  ClassroomDetailSkeleton,
  ClassroomEmptyState,
  ClassroomPageHeader,
  ClassroomTabs,
  type ClassroomTabItem,
} from "@/components/classroom";
import {
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  KeyRound,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";

export default function ClassDetailPage() {
  const { classId } = useParams();
  const id = Number(classId);

  const [tab, setTab] = useState<ClassroomTabItem["id"]>("leaderboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [klass, setKlass] = useState<any>(null);
  const isClassAdmin = klass?.my_role === "ADMIN";

  const [workspace, setWorkspace] = useState<{
    your_assignments?: any[];
    due_soon?: any[];
    recently_graded?: any[];
    is_student?: boolean;
  } | null>(null);

  const [assignments, setAssignments] = useState<any[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any | null>(null);

  const [people, setPeople] = useState<any[]>([]);
  const [codeBusy, setCodeBusy] = useState(false);

  const tabItems = useMemo<ClassroomTabItem[]>(
    () => [
      { id: "leaderboard", label: "Leaderboard", icon: Trophy },
      { id: "classwork", label: "Classwork", icon: ClipboardList },
      { id: "people", label: "People", icon: Users },
      { id: "grades", label: "Grades", icon: GraduationCap },
    ],
    [],
  );

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const [k, ws, pe] = await Promise.all([
        classesApi.get(id),
        classesApi.getStudentWorkspace(id),
        classesApi.people(id),
      ]);
      setKlass(k);
      setWorkspace(ws && typeof ws === "object" ? ws : null);
      setAssignments(Array.isArray(ws?.your_assignments) ? ws.your_assignments : []);
      setPeople(Array.isArray(pe) ? pe : []);
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { detail?: string } } };
      const st = ax.response?.status;
      const detail = ax.response?.data?.detail;
      if (st === 404) {
        setError("You don't have access to this group, or it no longer exists.");
      } else {
        setError(typeof detail === "string" ? detail : "Could not load class.");
      }
      setKlass(null);
      setWorkspace(null);
      setAssignments([]);
      setPeople([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    const unsub = subscribeRealtime(
      {
        onEvent: async (ev) => {
        // Delivery-only: refetch canonical APIs.
        if (ev.type === "resync") {
          const data = ev.data as { refresh?: string[]; classroom_id?: number };
          const hints = Array.isArray(data.refresh) ? data.refresh : ["workspace", "comments"];
          const scoped = data.classroom_id == null || Number(data.classroom_id) === id;
          if (!scoped) return;
          const needWorkspace = hints.includes("workspace");
          if (needWorkspace) {
            const ws = await classesApi.getStudentWorkspace(id);
            setWorkspace(ws && typeof ws === "object" ? ws : null);
            setAssignments(Array.isArray((ws as any)?.your_assignments) ? (ws as any).your_assignments : []);
          }
          return;
        }
        if (ev.type === "stream.updated") {
          const cid = Number((ev.data as any)?.classroom_id);
          if (cid && cid === id) {
            const ws = await classesApi.getStudentWorkspace(id);
            setWorkspace(ws && typeof ws === "object" ? ws : null);
            setAssignments(Array.isArray((ws as any)?.your_assignments) ? (ws as any).your_assignments : []);
          }
        }
        if (ev.type === "workspace.updated") {
          const cid = Number((ev.data as any)?.classroom_id);
          if (cid && cid === id) {
            const ws = await classesApi.getStudentWorkspace(id);
            setWorkspace(ws && typeof ws === "object" ? ws : null);
            setAssignments(Array.isArray((ws as any)?.your_assignments) ? (ws as any).your_assignments : []);
          }
        }
        },
      },
      { debounceMs: 80 },
    );
    return () => unsub();
  }, [id]);

  const formatDue = (s?: string) => {
    if (!s) return "No due date";
    try {
      return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return s;
    }
  };

  const wfLabel = (w?: string | null) => {
    if (w === "GRADED") return { text: "Graded", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" };
    if (w === "SUBMITTED") return { text: "Submitted", className: "bg-sky-500/15 text-sky-800 dark:text-sky-200" };
    if (w === "RETURNED") return { text: "Returned", className: "bg-violet-500/15 text-violet-900 dark:text-violet-200" };
    if (w === "NOT_STARTED") return { text: "Your work", className: "bg-amber-500/15 text-amber-900 dark:text-amber-200" };
    return null;
  };

  const accessDenied = !loading && !klass && !!error;

  if (accessDenied) {
    return (
      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="pointer-events-none absolute inset-0 -z-10 cr-classroom-bg" aria-hidden />
        <ClassroomPageHeader title="Group" eyebrow="Class" />
        <div className="mt-6 space-y-4">
          <ClassroomAlert tone="error">{error}</ClassroomAlert>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            If you were removed or the link is wrong, ask your teacher for an updated code.
          </p>
          <Link href="/classes" className="inline-flex">
            <ClassroomButton variant="secondary" size="md">
              Back to groups
            </ClassroomButton>
          </Link>
        </div>
      </div>
    );
  }

  const metaDays = formatLessonDaysMeta(klass?.lesson_days);
  const metaLine = (
    <>
      {klass?.subject ? <span>{klass.subject}</span> : null}
      {metaDays ? <span> · {metaDays}</span> : null}
      {klass?.lesson_time ? <span> · {klass.lesson_time}</span> : null}
      {klass?.lesson_hours ? <span> · {klass.lesson_hours}h</span> : null}
    </>
  );

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 cr-classroom-bg" aria-hidden />

      <div className="mb-6">
        <ClassroomPageHeader
          eyebrow="Class"
          title={klass?.name || "Group"}
          meta={klass ? metaLine : null}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {isClassAdmin ? (
                <Link
                  href="/classes/grade-homework"
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm",
                    "hover:border-primary/35 hover:bg-surface-2",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/90 focus-visible:ring-offset-2",
                  )}
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Grade homework
                </Link>
              ) : null}
              <ClassroomButton variant="secondary" size="md" onClick={refresh} disabled={loading}>
                <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </ClassroomButton>
            </div>
          }
        />
      </div>

      {error ? (
        <div className="mb-6">
          <ClassroomAlert tone="error">{error}</ClassroomAlert>
        </div>
      ) : null}

      <ClassroomTabs items={tabItems} value={tab} onChange={setTab} className="mb-8" />

      {/* Join code / room / Telegram info is shown only on Leaderboard (sidebar). */}

      {loading ? (
        <ClassroomDetailSkeleton />
      ) : (
        <div
          role="tabpanel"
          id={`classroom-panel-${tab}`}
          aria-labelledby={`classroom-tab-${tab}`}
          className="transition-opacity duration-200"
        >
          {tab === "leaderboard" ? (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <ClassLeaderboard classId={id} />
              </div>
              <div className="space-y-5">
                <ClassroomCard padding="md">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-indigo-500" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Classroom info
                    </p>
                  </div>
                  {isClassAdmin ? (
                    <>
                      <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Join code
                      </p>
                      <p className="mt-2 font-mono text-lg font-bold tracking-wider text-slate-900 dark:text-slate-50">
                        {klass?.join_code || "—"}
                      </p>
                    </>
                  ) : null}
                  <div className={`mt-4 border-t border-slate-200 pt-4 dark:border-slate-700 ${isClassAdmin ? "" : "border-t-0 pt-0"}`}>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Room number
                    </p>
                    <p className="mt-2 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {(klass?.room_number && String(klass.room_number).trim()) || "—"}
                    </p>
                    <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Telegram chat ID
                    </p>
                    <p className="mt-2 break-all font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {(klass?.telegram_chat_id && String(klass.telegram_chat_id).trim()) || "—"}
                    </p>
                  </div>
                </ClassroomCard>
                {workspace?.is_student ? (
                  <>
                    <ClassroomCard padding="md">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Due soon
                      </p>
                      {(workspace.due_soon || []).length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nothing due in the next 7 days.</p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {(workspace.due_soon || []).map((a: any) => (
                            <li key={a.id}>
                              <Link
                                href={studentClassworkAssignmentHref(id, a)}
                                className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                              >
                                {a.title}
                              </Link>
                              <p className="text-xs text-slate-500">{formatDue(a.due_at)}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </ClassroomCard>
                    <ClassroomCard padding="md">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Recently reviewed
                      </p>
                      {(workspace.recently_graded || []).length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No feedback yet.</p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {(workspace.recently_graded || []).map((row: any) => (
                            <li key={`rg-${row.assignment?.id}-${row.submission_id ?? "assessment"}`}>
                              <Link
                                href={studentRecentlyGradedHref(id, row)}
                                className="text-sm font-semibold text-indigo-600 dark:text-indigo-400"
                              >
                                {row.assignment?.title}
                              </Link>
                              {row.review?.grade != null ? (
                                <p className="text-xs text-slate-600 dark:text-slate-300">Score: {row.review.grade}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </ClassroomCard>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {tab === "classwork" ? (
            <div className="space-y-6">
              {isClassAdmin ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Classwork</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Homework, mocks, and pastpapers — students open each item from the list.
                    </p>
                  </div>
                  <ClassroomButton
                    variant="primary"
                    size="md"
                    className="shrink-0"
                    onClick={() => {
                      setEditingAssignment(null);
                      setCreateModalOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Create assignment
                  </ClassroomButton>
                </div>
              ) : (
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Classwork</h2>
              )}

              <div className="space-y-4">
                {assignments.length === 0 ? (
                  <ClassroomEmptyState
                    icon={ClipboardList}
                    title="No assignments yet"
                    description={
                      isClassAdmin
                        ? 'Create the first homework item with the "Create assignment" button.'
                        : "Your teacher hasn't posted classwork yet."
                    }
                    action={
                      isClassAdmin
                        ? {
                            label: "Create assignment",
                            onClick: () => {
                              setEditingAssignment(null);
                              setCreateModalOpen(true);
                            },
                          }
                        : undefined
                    }
                  />
                ) : (
                  assignments.map((a) => (
                    <div
                      key={a.id}
                      className="cr-surface flex flex-col gap-4 rounded-2xl p-5 transition-all duration-200 hover:border-indigo-200/60 hover:shadow-md dark:hover:border-indigo-500/25 sm:flex-row sm:items-stretch"
                    >
                      <Link
                        href={isClassAdmin ? `/classes/${id}/assignments/${a.id}` : studentClassworkAssignmentHref(id, a)}
                        className="min-w-0 flex-1"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-base font-bold text-slate-900 dark:text-slate-50">{a.title}</p>
                              {(a.practice_test ||
                                a.pastpaper_pack ||
                                (Array.isArray(a.practice_test_ids) && a.practice_test_ids.length > 0) ||
                                (Array.isArray(a.practice_bundle_tests) && a.practice_bundle_tests.length > 0)) ? (
                                <span className="shrink-0 rounded-md bg-blue-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                                  Pastpaper
                                </span>
                              ) : null}
                              {a.mock_exam ? (
                                <span className="shrink-0 rounded-md bg-sky-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 dark:text-sky-200">
                                  Mock
                                </span>
                              ) : null}
                              {wfLabel(a.workflow_status) ? (
                                <span
                                  className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${wfLabel(a.workflow_status)!.className}`}
                                >
                                  {wfLabel(a.workflow_status)!.text}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatDue(a.due_at)}</p>
                          </div>
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {a.submissions_count ?? 0} submitted
                          </span>
                        </div>
                        {a.instructions ? (
                          <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{a.instructions}</p>
                        ) : null}
                      </Link>
                      {isClassAdmin ? (
                        <div className="flex shrink-0 flex-row gap-2 border-t border-slate-200/70 pt-3 sm:flex-col sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 dark:border-slate-700/70">
                          <ClassroomButton
                            variant="secondary"
                            size="sm"
                            className="flex-1 sm:flex-none"
                            onClick={() => {
                              setEditingAssignment(a);
                              setCreateModalOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </ClassroomButton>
                          <ClassroomButton
                            variant="danger"
                            size="sm"
                            className="flex-1 sm:flex-none"
                            onClick={async () => {
                              if (!confirm(`Delete homework “${a.title}”? Submissions will be removed.`)) return;
                              try {
                                await classesApi.deleteAssignment(id, a.id);
                                const ws = await classesApi.getStudentWorkspace(id);
                                setWorkspace(ws && typeof ws === "object" ? ws : null);
                                setAssignments(Array.isArray(ws?.your_assignments) ? ws.your_assignments : []);
                              } catch (e: unknown) {
                                const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                                alert(typeof msg === "string" ? msg : "Could not delete assignment.");
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </ClassroomButton>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <CreateAssignmentModal
                open={createModalOpen && isClassAdmin}
                classId={id}
                editingAssignment={editingAssignment}
                onClose={() => {
                  setCreateModalOpen(false);
                  setEditingAssignment(null);
                }}
                onSuccess={async () => {
                  const ws = await classesApi.getStudentWorkspace(id);
                  setWorkspace(ws && typeof ws === "object" ? ws : null);
                  setAssignments(Array.isArray(ws?.your_assignments) ? ws.your_assignments : []);
                  setTab("classwork");
                  setEditingAssignment(null);
                }}
              />
            </div>
          ) : null}

          {tab === "people" ? (
            <ClassroomCard padding="none" className="overflow-hidden">
              <div className="border-b border-slate-200/70 px-5 py-4 dark:border-slate-700/70">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Members</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{people.length} people in this group</p>
              </div>
              {people.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No members listed.</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {people.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {m.user?.profile_image_url ? (
                          <img
                            src={m.user.profile_image_url}
                            alt=""
                            className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-slate-200/80 dark:ring-slate-700"
                          />
                        ) : (
                          <div
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-bold text-indigo-800 ring-2 ring-indigo-500/20 dark:bg-indigo-950/60 dark:text-indigo-200 dark:ring-indigo-500/30"
                            aria-hidden
                          >
                            {memberAvatarInitials(m.user || {})}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-50">
                            {m.user?.first_name || m.user?.email} {m.user?.last_name || ""}
                          </p>
                          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{m.user?.email}</p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                          m.role === "ADMIN"
                            ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                            : "bg-slate-500/10 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {m.role}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </ClassroomCard>
          ) : null}

          {tab === "grades" ? (
            <ClassroomCard padding="lg">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Grades</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Open a classwork item to review submissions and enter scores. For class averages and rankings on pastpaper
                homework, use the <strong className="font-semibold text-slate-800 dark:text-slate-100">Leaderboard</strong>{" "}
                tab.
              </p>
            </ClassroomCard>
          ) : null}
        </div>
      )}

      <div className="mt-10 border-t border-slate-200/70 pt-6 dark:border-slate-700/70">
        <Link
          href="/classes"
          className="text-sm font-semibold text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400"
        >
          ← All groups
        </Link>
      </div>
    </div>
  );
}
