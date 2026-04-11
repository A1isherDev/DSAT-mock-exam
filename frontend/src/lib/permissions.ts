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

export function getScopeList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = Cookies.get("lms_scope");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function can(codename: string): boolean {
  const p = getPermissionList();
  if (p.includes("*")) return true;
  const legacyToNew: Record<string, string> = {
    // Legacy permissions still referenced in older UI components
    manage_roles: "assign_access",
    assign_test_access: "assign_access",
    manage_classrooms: "create_classroom",
    access_lms_admin: "manage_users", // admin panel access (Issue #1)
    view_all_tests: "manage_tests",
    view_english_tests: "manage_tests",
    view_math_tests: "manage_tests",
    create_test: "manage_tests",
    edit_test: "manage_tests",
    delete_test: "manage_tests",
    create_mock_sat: "manage_tests",
    create_midterm_mock: "manage_tests",
  };
  const mapped = legacyToNew[codename] || codename;
  return p.includes(mapped);
}

/** Timed mock / test admin surfaces are part of manage_tests. */
export function canManageMockExamShell(): boolean {
  return can("*") || can("manage_tests");
}

/**
 * Subject-scoped visibility for tests (mirrors backend scope enforcement).
 * Platform English tests use subject READING_WRITING, scope key is "english".
 */
export function canAbacTestSubject(subject: string): boolean {
  if (can("*")) return true;
  const scopes = getScopeList().map((s) => String(s || "").toLowerCase());
  if (subject === "READING_WRITING") return scopes.includes("english");
  if (subject === "MATH") return scopes.includes("math");
  return false;
}

/** Default pastpaper bulk-assign subject filter: scoped admins start on their subject only. */
export function defaultBulkPastpaperSubjectScope(): "BOTH" | "MATH" | "READING_WRITING" {
  if (can("*")) return "BOTH";
  const scopes = getScopeList().map((s) => String(s || "").toLowerCase());
  const hasMath = scopes.includes("math");
  const hasEng = scopes.includes("english");
  if (hasMath && !hasEng) return "MATH";
  if (hasEng && !hasMath) return "READING_WRITING";
  return "BOTH";
}

export function canCreateTestForSubject(subject: "READING_WRITING" | "MATH"): boolean {
  return can("manage_tests") && canAbacTestSubject(subject);
}

export function canEditQuestionsForSubject(subject: string | undefined): boolean {
  if (!subject) return false;
  return can("manage_tests") && canAbacTestSubject(subject);
}

export function canDeletePracticeTestFromMock(subject: string | undefined): boolean {
  if (!subject) return false;
  return can("manage_tests") && canAbacTestSubject(subject);
}

/** Global Questions admin tab (not midterm-only flows). */
export function canUseGlobalQuestionsTab(): boolean {
  return can("*") || can("manage_tests");
}
