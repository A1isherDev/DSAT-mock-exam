"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, MoreVertical, Eye, Archive, RotateCcw, ExternalLink, Play, ArrowRight } from "lucide-react";
import CreateAssignmentModal from "@/components/CreateAssignmentModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/cn";
import { normalizeApiError } from "@/lib/apiError";
import { pushGlobalToast } from "@/lib/toastBus";
import { Button, Pill, LoadingState, ErrorState, EmptyState, ConfirmDialog } from "../ui";
import { useAssignments } from "../hooks";
import { useAssignmentLifecycle } from "../homeworkHooks";
import { classroomKeys } from "../queryKeys";
import { capabilitiesFor } from "../capabilities";
import { spawnRipple } from "../ui/ripple";
import { KIND_LABEL, type AssignmentKind } from "../homeworkApi";
import { SubmissionStatusPill } from "./statusPill";
import type { ClassroomWithRole } from "../types";

interface AsgRow {
  id: number;
  title: string;
  due_at?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  workflow_status?: string | null;
  assessment_homework?: unknown | null;
  submissions_count?: number;
  // New content metadata (same fields the detail payload carries).
  content_type?: string;
  contents?: { kind: AssignmentKind; title: string; item_count: number | null }[];
  mock_exam?: number | null;
  practice_test?: number | null;
  practice_test_pack?: number | null;
  practice_test_ids?: number[] | null;
}

function shortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Right-aligned status line — 1:1 with the mockup (Posted / Due / Was due-red). */
function statusInfo(a: AsgRow, staff: boolean): { text: string; overdue: boolean } {
  if (a.due_at) {
    const due = new Date(a.due_at).getTime();
    if (!Number.isNaN(due)) {
      const done = !staff && (a.workflow_status === "SUBMITTED" || a.workflow_status === "REVIEWED");
      if (due < Date.now() && !done) return { text: `Was due ${shortDate(a.due_at)}`, overdue: true };
      return { text: `Due ${shortDate(a.due_at)}`, overdue: false };
    }
  }
  const posted = a.published_at || a.created_at;
  return posted ? { text: `Posted ${shortDate(posted)}`, overdue: false } : { text: "No deadline", overdue: false };
}

function hrefFor(classId: number, a: AsgRow): string {
  // Open the in-class detail page (it deep-links into every bundled activity).
  return `/classes/${classId}/assignments/${a.id}`;
}

/** Derive the single content kind from a list row (mirror of homeworkApi.assignmentKind). */
function rowKind(a: AsgRow): AssignmentKind {
  if (a.assessment_homework != null) return "QUIZ";
  if (a.mock_exam != null) return "MOCK";
  if (a.practice_test_pack != null) return "PRACTICE";
  if (a.practice_test != null || (a.practice_test_ids && a.practice_test_ids.length)) return "PASTPAPER";
  return "FILE";
}

/** Type badge label for a row: explicit content_type → bundle → derived kind. */
function rowBadge(a: AsgRow): string {
  const contents = a.contents ?? [];
  if (contents.length > 1) return "Bundle";
  if (a.content_type) {
    const ct = a.content_type.toLowerCase();
    if (ct === "assessment") return KIND_LABEL.QUIZ;
    if (ct === "mock") return KIND_LABEL.MOCK;
    if (ct === "pastpaper") return KIND_LABEL.PASTPAPER;
    if (ct === "practice") return KIND_LABEL.PRACTICE;
    if (ct === "module") return KIND_LABEL.MODULE;
    if (ct === "file") return KIND_LABEL.FILE;
  }
  return KIND_LABEL[rowKind(a)];
}

/**
 * Direct "Start" href for a single-content row, using the SAME per-kind routes as
 * homeworkApi.startHref / contentActions. Returns null when no reliable direct link
 * can be computed from the row alone (caller falls back to the detail page).
 */
function directHref(a: AsgRow): string | null {
  const kind = rowKind(a);
  if (kind === "QUIZ") return `/assessments/${a.id}`;
  if (kind === "MOCK") return a.mock_exam != null ? `/mock/${a.mock_exam}` : null;
  if (kind === "PRACTICE") return a.practice_test_pack != null ? `/practice-tests/${a.practice_test_pack}` : null;
  if (kind === "PASTPAPER") {
    if (a.practice_test != null) return `/practice-test/${a.practice_test}`;
    const ids = a.practice_test_ids ?? [];
    if (ids.length === 1) return `/practice-test/${ids[0]}`;
    if (ids.length > 1) return `/pastpapers`;
    return null;
  }
  return null; // FILE / unknown → no direct start
}

export function Assignments({ classroom }: { classroom: ClassroomWithRole }) {
  const classId = Number(classroom.id);
  const caps = capabilitiesFor(classroom.my_role);
  const staff = caps.canManageAssignments;
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useAssignments(classId);
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const archived = useQuery({
    queryKey: [...classroomKeys.assignments(classId), "archived"],
    queryFn: async () => (await api.get(`/classes/${classId}/assignments/?include_archived=1`)).data,
    enabled: showArchived && staff,
  });

  const rows = (data?.items ?? []) as AsgRow[];
  const archivedRows = ((Array.isArray(archived.data) ? archived.data : archived.data?.items ?? []) as AsgRow[])
    .filter((a) => a.status === "ARCHIVED");

  return (
    <div className="cr-section space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[28px]">Assignments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {staff ? "Homework, practice tests, and classwork" : "Your work for this class"}
          </p>
        </div>
        {staff && (
          <Button className="cr-ripple" onPointerDown={spawnRipple} icon={Plus} onClick={() => setCreateOpen(true)}>New</Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <LoadingState label="Loading assignments…" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assignments yet"
          description={staff ? "Create the first assignment for this class." : "New assignments will appear here."}
          action={staff && <Button icon={Plus} onClick={() => setCreateOpen(true)}>New assignment</Button>}
        />
      ) : staff ? (
        <div className="divide-y divide-border border-y border-border">
          {rows.map((a, i) => (
            <StaffRow key={a.id} classId={classId} a={a} index={i} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((a, i) => (
            <StudentCard key={a.id} classId={classId} a={a} index={i} />
          ))}
        </div>
      )}

      {staff && (
        <button onClick={() => setShowArchived((v) => !v)} className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      )}

      {showArchived && staff && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-foreground">Archived</p>
          {archived.isLoading ? (
            <LoadingState label="Loading…" />
          ) : archivedRows.length === 0 ? (
            <EmptyState icon={Archive} title="Nothing archived" />
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {archivedRows.map((a, i) => <StaffRow key={a.id} classId={classId} a={a} index={i} archived />)}
            </div>
          )}
        </div>
      )}

      {staff && (
        <CreateAssignmentModal
          open={createOpen}
          classId={classId}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            qc.invalidateQueries({ queryKey: classroomKeys.assignments(classId) });
          }}
        />
      )}
    </div>
  );
}

/** Shared row chrome: indigo-circle icon tile + title + status date (mockup order:
 *  icon · title · badge · date · actions). */
function RowShell({ classId, a, index, staff, badge, actions }: { classId: number; a: AsgRow; index: number; staff: boolean; badge?: React.ReactNode; actions?: React.ReactNode }) {
  const s = statusInfo(a, staff);
  return (
    <div className="cr-rowin group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2" style={{ animationDelay: `${Math.min(index, 14) * 40}ms` }}>
      <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ClipboardList className="h-5 w-5" aria-hidden />
      </span>
      <Link href={hrefFor(classId, a)} className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-foreground transition-colors group-hover:text-primary">{a.title}</p>
        {staff && typeof a.submissions_count === "number" && a.submissions_count > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">{a.submissions_count} submitted</p>
        )}
      </Link>
      {badge}
      <span className={cn("shrink-0 whitespace-nowrap text-[13px] font-semibold", s.overdue ? "text-[#c0392b] dark:text-rose-400" : "text-muted-foreground")}>
        {s.text}
      </span>
      {actions}
    </div>
  );
}

/** Student homework card — type badge, title, content name(s), due/countdown, status + Start. */
function StudentCard({ classId, a, index }: { classId: number; a: AsgRow; index: number }) {
  const router = useRouter();
  const s = statusInfo(a, false);
  const contents = a.contents ?? [];
  const bundle = contents.length > 1;
  const contentNames = contents.map((c) => c.title).filter(Boolean).join(" · ");

  // Single content → Start straight into the welcome page (direct href, else detail fallback);
  // bundle → "Open" the detail page, which shows the split launcher.
  const direct = bundle ? null : directHref(a);
  const startHrefValue = bundle ? hrefFor(classId, a) : (direct ?? hrefFor(classId, a));
  const startLabel = bundle ? "Open" : "Start";
  const StartIcon = bundle ? ArrowRight : Play;

  return (
    <div
      className="cr-rowin cr-card cr-lift group rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:p-5"
      style={{ animationDelay: `${Math.min(index, 14) * 40}ms` }}
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardList className="h-5 w-5" aria-hidden />
        </span>
        <Link href={hrefFor(classId, a)} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="primary">{rowBadge(a)}</Pill>
            {a.workflow_status && <SubmissionStatusPill status={a.workflow_status} />}
          </div>
          <p className="mt-1.5 truncate text-[15px] font-bold text-foreground transition-colors group-hover:text-primary">
            {a.title}
          </p>
          {contentNames && (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{contentNames}</p>
          )}
          <p className={cn("mt-1 text-[13px] font-semibold", s.overdue ? "text-[#c0392b] dark:text-rose-400" : "text-muted-foreground")}>
            {s.text}
          </p>
        </Link>
        <Button
          className="cr-press cr-ripple shrink-0"
          icon={StartIcon}
          onPointerDown={spawnRipple}
          onClick={() => router.push(startHrefValue)}
        >
          {startLabel}
        </Button>
      </div>
    </div>
  );
}

function StaffRow({ classId, a, index, archived }: { classId: number; a: AsgRow; index: number; archived?: boolean }) {
  const lc = useAssignmentLifecycle(classId, a.id);
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function run(m: { mutateAsync: () => Promise<unknown> }, ok: string) {
    try {
      await m.mutateAsync();
      pushGlobalToast({ tone: "success", message: ok });
      setConfirmArchive(false);
    } catch (e) {
      pushGlobalToast({ tone: "error", message: normalizeApiError(e).message });
    }
  }

  return (
    <RowShell
      classId={classId}
      a={a}
      index={index}
      staff
      badge={
        a.status === "DRAFT" ? <Pill tone="neutral">Draft</Pill>
          : a.status === "ARCHIVED" ? <Pill tone="neutral">Archived</Pill>
          : null
      }
      actions={
        <>
          <KebabMenu>
            <MenuItem icon={ExternalLink} href={hrefFor(classId, a)}>Open</MenuItem>
            {a.status === "DRAFT" && (
              <MenuItem icon={Eye} onClick={() => run(lc.publish, `“${a.title}” published.`)}>Publish</MenuItem>
            )}
            {a.status === "PUBLISHED" && (
              <MenuItem icon={Archive} onClick={() => setConfirmArchive(true)}>Archive</MenuItem>
            )}
            {(a.status === "ARCHIVED" || archived) && (
              <MenuItem icon={RotateCcw} onClick={() => run(lc.unarchive, `“${a.title}” unarchived.`)}>Unarchive</MenuItem>
            )}
          </KebabMenu>

          <ConfirmDialog
            open={confirmArchive}
            title="Archive assignment?"
            description={`“${a.title}” will be hidden from students. Existing grades are kept and you can unarchive it later.`}
            confirmLabel="Archive"
            tone="danger"
            loading={lc.archive.isPending}
            onConfirm={() => run(lc.archive, `“${a.title}” archived.`)}
            onCancel={() => setConfirmArchive(false)}
          />
        </>
      }
    />
  );
}

/** Minimal kebab dropdown (click-away via a transparent overlay). */
function KebabMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Actions"
        aria-expanded={open}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <MoreVertical className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-[var(--ds-shadow-lg)]"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, onClick, href, children }: { icon: React.ElementType; onClick?: () => void; href?: string; children: React.ReactNode }) {
  const cls = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-surface-2";
  const body = (<><Icon className="h-4 w-4 text-muted-foreground" aria-hidden />{children}</>);
  return href ? <Link href={href} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}
