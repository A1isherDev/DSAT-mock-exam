import type { BulkAssignProfile, BulkAssignUserRow, PastpaperScope, PlatformSubject } from "./types";

export function isStudentRole(role: string | undefined | null): boolean {
  return String(role || "").toLowerCase() === "student";
}

export function grantsFromProfile(profile: BulkAssignProfile | null | undefined) {
  return {
    math: !!profile?.subject_grants?.math,
    english: !!profile?.subject_grants?.english,
  };
}

export function resolvePastpaperSectionIdsForPack(
  packId: number,
  packs: Array<{ id: number; sections?: Array<{ id: number; subject: string }> }>,
  scope: PastpaperScope,
): number[] {
  const pack = packs.find((p) => Number(p.id) === Number(packId));
  const sections = pack?.sections || [];
  const ids: number[] = [];
  for (const s of sections) {
    if (scope === "BOTH") ids.push(s.id);
    else if (scope === "MATH" && s.subject === "MATH") ids.push(s.id);
    else if (scope === "READING_WRITING" && s.subject === "READING_WRITING") ids.push(s.id);
  }
  return ids;
}

export function platformSubjectsInResolvedPastpaper(
  packId: number,
  sectionIds: number[],
  packs: Array<{ id: number; sections?: Array<{ id: number; subject: PlatformSubject }> }>,
): Set<PlatformSubject> {
  const pack = packs.find((p) => Number(p.id) === Number(packId));
  const out = new Set<PlatformSubject>();
  for (const s of pack?.sections || []) {
    if (!sectionIds.includes(s.id)) continue;
    if (s.subject === "MATH" || s.subject === "READING_WRITING") out.add(s.subject);
  }
  return out;
}

/** Subjects that timed-mock bulk assign will touch for the given mock + toggles. */
export function platformSubjectsForMockAssignment(
  mock: { tests?: Array<{ subject?: string; form_type?: string }> },
  assignmentType: string,
  formType: string,
): Set<PlatformSubject> {
  const tests = (mock.tests || []).filter((t) => !formType || (t.form_type || "INTERNATIONAL") === formType);
  const inMock = new Set(tests.map((t) => t.subject).filter(Boolean) as PlatformSubject[]);
  if (assignmentType === "MATH") {
    return new Set([...inMock].filter((s) => s === "MATH"));
  }
  if (assignmentType === "ENGLISH") {
    return new Set([...inMock].filter((s) => s === "READING_WRITING"));
  }
  const want: PlatformSubject[] = ["MATH", "READING_WRITING"];
  return new Set([...inMock].filter((s) => want.includes(s)));
}

export type EligibilityRow = {
  selectable: boolean;
  reason?: string;
  /** Shown when the student will receive only part of a multi-subject selection. */
  partialHint?: string;
};

export function pastpaperRowEligibility(
  profile: BulkAssignProfile | null | undefined,
  subjectsInContent: Set<PlatformSubject>,
): EligibilityRow {
  const g = grantsFromProfile(profile);
  let canMath = subjectsInContent.has("MATH") && g.math;
  let canRw = subjectsInContent.has("READING_WRITING") && g.english;
  if (subjectsInContent.size === 0) {
    return { selectable: false, reason: "No sections match the current subject scope" };
  }
  if (!canMath && !canRw) {
    const need: string[] = [];
    if (subjectsInContent.has("MATH")) need.push("Math");
    if (subjectsInContent.has("READING_WRITING")) need.push("Reading & Writing");
    return {
      selectable: false,
      reason:
        need.length > 1
          ? "No Math or Reading & Writing access"
          : need[0] === "Math"
            ? "No Math access"
            : "No Reading & Writing access",
    };
  }
  const wantsBoth = subjectsInContent.has("MATH") && subjectsInContent.has("READING_WRITING");
  if (wantsBoth && (!canMath || !canRw)) {
    if (canMath && !canRw) return { selectable: true, partialHint: "Receives Math sections only" };
    if (!canMath && canRw) return { selectable: true, partialHint: "Receives Reading & Writing sections only" };
  }
  return { selectable: true };
}

export function mockRowEligibility(
  profile: BulkAssignProfile | null | undefined,
  subjectsTouched: Set<PlatformSubject>,
): EligibilityRow {
  return pastpaperRowEligibility(profile, subjectsTouched);
}

export function studentDisplayName(u: BulkAssignUserRow): string {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || String(u.username || "").trim() || `User #${u.id}`;
}

export function accountStatusLabel(u: BulkAssignUserRow): string {
  if (u.is_frozen) return "Frozen";
  if (u.is_active === false) return "Inactive";
  return "Active";
}

export function matchesClassroomFilter(u: BulkAssignUserRow, classroomId: number | "all"): boolean {
  if (classroomId === "all") return true;
  const rooms = u.bulk_assign_profile?.classrooms || [];
  return rooms.some((c) => c.id === classroomId);
}

export function matchesSubjectTrackFilter(
  u: BulkAssignUserRow,
  filter: "ALL" | "MATH" | "ENGLISH",
): boolean {
  if (filter === "ALL") return true;
  const p = u.bulk_assign_profile;
  if (!p) return false;
  if (filter === "MATH") {
    return p.subject_grants.math || p.classrooms.some((c) => c.subject === "MATH");
  }
  return p.subject_grants.english || p.classrooms.some((c) => c.subject === "ENGLISH");
}
