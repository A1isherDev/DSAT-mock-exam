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

  // Accept both canonical and legacy codenames transparently.
  const aliases: Record<string, string[]> = {
    // Canonical -> legacy equivalents
    assign_access: ["manage_roles", "assign_test_access"],
    create_classroom: ["manage_classrooms"],
    manage_tests: [
      "view_all_tests",
      "view_english_tests",
      "view_math_tests",
      "create_test",
      "edit_test",
      "delete_test",
      "create_mock_sat",
      "create_midterm_mock",
    ],
    manage_users: ["access_lms_admin"],

    // Legacy -> canonical equivalents
    manage_roles: ["assign_access"],
    assign_test_access: ["assign_access"],
    manage_classrooms: ["create_classroom"],
    access_lms_admin: ["manage_users"],
    view_all_tests: ["manage_tests"],
    view_english_tests: ["manage_tests"],
    view_math_tests: ["manage_tests"],
    create_test: ["manage_tests"],
    edit_test: ["manage_tests"],
    delete_test: ["manage_tests"],
    create_mock_sat: ["manage_tests"],
    create_midterm_mock: ["manage_tests"],
  };

  const checks = new Set<string>([codename, ...(aliases[codename] || [])]);
  for (const c of checks) {
    if (p.includes(c)) return true;
  }
  return false;
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
