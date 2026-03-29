import Cookies from "js-cookie";

/**
 * UI-only permission helpers. The backend enforces all authorization.
 * Synced from login / Google auth responses into the `lms_permissions` cookie (JSON array).
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

/** Mock exam shell create/update/delete — backend requires wildcard or view_all_tests. */
export function canManageMockExamShell(): boolean {
  return can("*") || can("view_all_tests");
}

/**
 * Subject-scoped visibility for tests (mirrors backend ABAC for ENGLISH_ADMIN / MATH_ADMIN).
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
