import Cookies from "js-cookie";

/**
 * UI-only permission helpers. The backend enforces all authorization.
 * Synced from login / Google auth into the `lms_permissions` cookie (JSON array).
 */
export function getPermissionList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = Cookies.get("lms_permissions");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function can(codename: string): boolean {
  const p = getPermissionList();
  return p.includes("*") || p.includes(codename);
}

export function canCreateFullMockSat(): boolean {
  return can("*") || can("view_all_tests") || can("create_mock_sat");
}

export function canCreateMidtermMock(): boolean {
  return (
    can("*") ||
    can("view_all_tests") ||
    can("create_midterm_mock") ||
    can("create_mock_sat")
  );
}

/** Timed mock shell tab / cards: full SAT and/or midterm authoring. */
export function canManageMockExamShell(): boolean {
  return canCreateFullMockSat() || canCreateMidtermMock();
}

/**
 * Subject-scoped visibility for tests (mirrors backend ABAC for ENGLISH_TEACHER / MATH_TEACHER).
 * Platform English tests use subject READING_WRITING.
 */
export function canAbacTestSubject(subject: string): boolean {
  if (can("*") || can("view_all_tests")) return true;
  const hasEng = can("view_english_tests");
  const hasMath = can("view_math_tests");
  if (!hasEng && !hasMath) return true;
  if (subject === "READING_WRITING") return hasEng;
  if (subject === "MATH") return hasMath;
  return false;
}

/** Default pastpaper bulk-assign subject filter: scoped admins start on their subject only. */
export function defaultBulkPastpaperSubjectScope(): "BOTH" | "MATH" | "READING_WRITING" {
  if (can("*") || can("view_all_tests")) return "BOTH";
  const hasEng = can("view_english_tests");
  const hasMath = can("view_math_tests");
  if (hasMath && !hasEng) return "MATH";
  if (hasEng && !hasMath) return "READING_WRITING";
  return "BOTH";
}

export function canCreateTestForSubject(subject: "READING_WRITING" | "MATH"): boolean {
  return can("create_test") && canAbacTestSubject(subject);
}

export function canEditQuestionsForSubject(subject: string | undefined): boolean {
  if (!subject) return false;
  return can("edit_test") && canAbacTestSubject(subject);
}

export function canDeletePracticeTestFromMock(subject: string | undefined): boolean {
  if (!subject) return false;
  return can("delete_test") && canAbacTestSubject(subject);
}

/** Global Questions admin tab (not midterm-only flows). */
export function canUseGlobalQuestionsTab(): boolean {
  return can("*") || can("view_all_tests") || can("create_test");
}
