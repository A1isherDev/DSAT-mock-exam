/**
 * LineageInfo — Inline lineage signals for content records.
 *
 * DESIGN PRINCIPLE:
 *   Lineage is not supplementary metadata. It is the primary cognitive signal
 *   that prevents authors from treating published content as editable rows.
 *   These components appear inline in lists, not in drawers — because lineage
 *   must be seen BEFORE an edit action is taken, not discovered after.
 *
 * COMPONENTS:
 *   QuestionLineage   — shows parent set state + IN_USE warning for questions
 *   SetLineage        — shows version state + question composition for sets
 *   AssignmentLineage — shows pinned snapshot metadata for assignments
 *   ImpactWarning     — full warning block for mutation of in-use content
 */

import Link from "next/link";
import { Lock, GitBranch, Layers, ArrowRight } from "lucide-react";
import { StateTag } from "./StateTag";
import { cn } from "@/lib/cn";

// ─── Question lineage ─────────────────────────────────────────────────────────

type QuestionLineageProps = {
  setId: number;
  setTitle: string;
  setIsPublished: boolean;
  className?: string;
};

/**
 * QuestionLineage — shown on every question row in the Question Bank.
 *
 * When the parent set is published, shows the IN_USE state tag with the
 * explicit warning: editing this question will create a new revision.
 *
 * This is the primary mechanism that prevents authors from thinking
 * "I'll just quickly fix this question" without understanding the consequence.
 */
export function QuestionLineage({
  setId,
  setTitle,
  setIsPublished,
  className,
}: QuestionLineageProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Link
        href={`/builder/sets/${setId}`}
        className="text-xs font-semibold text-foreground hover:text-primary hover:underline truncate max-w-[180px] block"
        title={`Open set: ${setTitle}`}
      >
        {setTitle}
      </Link>
      {setIsPublished ? (
        <div className="flex items-center gap-1">
          <StateTag state="IN_USE" size="xs" />
          <span className="text-[9px] text-muted-foreground font-medium leading-tight">
            edits create new revision
          </span>
        </div>
      ) : (
        <StateTag state="FREE" size="xs" showIcon={false} />
      )}
    </div>
  );
}

// ─── Set lineage ──────────────────────────────────────────────────────────────

type SetLineageProps = {
  setId: number;
  isPublished: boolean;
  questionCount: number;
  activeQuestionCount: number;
  /** Optional: number of assignments referencing this set (if known) */
  assignmentCount?: number;
  updatedAt?: string;
  className?: string;
};

/**
 * SetLineage — shown in the assessment sets list and in the publish queue.
 *
 * Communicates the content composition and publishing state of a set,
 * giving operators a quick answer to "is this safe to edit?" and
 * "who depends on this?".
 */
export function SetLineage({
  isPublished,
  questionCount,
  activeQuestionCount,
  assignmentCount,
  updatedAt,
  className,
}: SetLineageProps) {
  const inactiveCount = questionCount - activeQuestionCount;
  const lastUpdated = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-xs text-muted-foreground", className)}>
      {/* Question composition */}
      <span className="flex items-center gap-1">
        <Layers className="h-3 w-3 shrink-0" />
        {questionCount} question{questionCount === 1 ? "" : "s"}
        {inactiveCount > 0 && (
          <span className="text-amber-600 font-semibold ml-0.5">
            ({activeQuestionCount} active)
          </span>
        )}
      </span>

      {/* Assignment usage */}
      {assignmentCount != null && assignmentCount > 0 && (
        <>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1 font-semibold text-blue-700">
            <Lock className="h-3 w-3 shrink-0" />
            {assignmentCount} assignment{assignmentCount === 1 ? "" : "s"} pinned
          </span>
        </>
      )}

      {/* Version state */}
      {isPublished && (
        <>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1 text-amber-700 font-semibold">
            <Lock className="h-3 w-3 shrink-0" />
            immutable
          </span>
        </>
      )}

      {/* Last updated */}
      {lastUpdated && !isPublished && (
        <>
          <span className="text-border">·</span>
          <span>updated {lastUpdated}</span>
        </>
      )}
    </div>
  );
}

// ─── Assignment lineage (snapshot pin display) ────────────────────────────────

type AssignmentLineageProps = {
  /** Set title from assessment_homework.set */
  setTitle?: string | null;
  /** Set id for linking back to the authoring surface */
  setId?: number | null;
  /** Subject for color coding */
  subject?: string | null;
  /** Whether the referenced set is currently published */
  setIsPublished?: boolean;
  className?: string;
};

/**
 * AssignmentLineage — shown on every assignment row in the ops console.
 *
 * Makes it explicit that assignments are pinned to a specific assessment set.
 * Operators must understand: changing the set does NOT retroactively affect
 * existing assignments. This component makes that architectural fact visible.
 */
export function AssignmentLineage({
  setTitle,
  setId,
  subject,
  setIsPublished,
  className,
}: AssignmentLineageProps) {
  if (!setTitle) {
    return (
      <span className={cn("text-xs text-muted-foreground italic", className)}>
        No assessment set linked
      </span>
    );
  }

  const subjectColor =
    subject === "math"
      ? "bg-purple-100 text-purple-700"
      : subject === "english"
        ? "bg-teal-100 text-teal-700"
        : "bg-slate-100 text-slate-600";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Pinned to snapshot" />
      {setId ? (
        <Link
          href={`/builder/sets/${setId}`}
          className="text-xs font-semibold text-foreground hover:text-primary hover:underline"
          title="Open in questions console"
          target="_blank"
          rel="noreferrer"
        >
          {setTitle}
        </Link>
      ) : (
        <span className="text-xs font-semibold text-foreground">{setTitle}</span>
      )}
      {subject && (
        <span
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide",
            subjectColor,
          )}
        >
          {subject}
        </span>
      )}
      {setIsPublished != null && (
        <StateTag
          state={setIsPublished ? "PUBLISHED" : "DRAFT"}
          size="xs"
          showIcon={false}
        />
      )}
    </div>
  );
}

// ─── Impact warning ───────────────────────────────────────────────────────────

type ImpactWarningProps = {
  /**
   * What kind of content is being mutated.
   * Controls the warning copy.
   */
  contentType: "question" | "set";
  contentLabel?: string;
  /**
   * Number of assignments that reference this content.
   * If 0 or undefined, the warning is lighter.
   */
  assignmentCount?: number;
  onConfirm?: () => void;
  onCancel?: () => void;
  className?: string;
};

/**
 * ImpactWarning — full-block warning shown before mutating IN_USE content.
 *
 * Used in:
 * - The assessment builder when the set is published
 * - The question editor when the question's parent set is published
 *
 * This is NOT a modal — it renders inline above the edit form so authors
 * cannot miss it. A modal can be dismissed without reading; an inline
 * warning cannot.
 */
export function ImpactWarning({
  contentType,
  contentLabel,
  assignmentCount,
  onConfirm,
  onCancel,
  className,
}: ImpactWarningProps) {
  const isSet = contentType === "set";
  const label = contentLabel ?? (isSet ? "this assessment set" : "this question");

  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <GitBranch className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-extrabold text-amber-900">
            {isSet ? "You are editing a published assessment" : "You are editing a live question"}
          </p>
          <p className="mt-1 text-sm text-amber-800 leading-relaxed">
            {label} is referenced by published content.{" "}
            {isSet
              ? "Your changes will NOT affect existing student attempts — those are pinned to the snapshot that was published."
              : "Saving creates a new question revision. The original is preserved in all historical snapshots."}
          </p>

          {assignmentCount != null && assignmentCount > 0 && (
            <p className="mt-2 text-sm font-bold text-amber-900">
              <Lock className="inline h-3.5 w-3.5 mr-1" />
              {assignmentCount} assignment{assignmentCount === 1 ? "" : "s"} currently pinned to
              this snapshot.
            </p>
          )}

          <ul className="mt-3 space-y-1.5 text-sm text-amber-800">
            <li className="flex items-start gap-1.5">
              <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Students who already submitted are unaffected.
            </li>
            <li className="flex items-start gap-1.5">
              <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Historical review pages always show the snapshot version.
            </li>
            <li className="flex items-start gap-1.5">
              <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Grading provenance is permanently tied to the original snapshot.
            </li>
          </ul>
        </div>
      </div>

      {(onConfirm || onCancel) && (
        <div className="flex items-center gap-2 pt-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          )}
          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition-colors"
            >
              I understand — continue editing
            </button>
          )}
        </div>
      )}
    </div>
  );
}
