/**
 * Role → capability mapping. Permissions are derived here, never hardcoded as
 * string comparisons in components. Forward-compatible with the rebuild role model
 * (OWNER/TEACHER/TA/STUDENT) while still understanding legacy ADMIN/CO_TEACHER.
 */

import type { MembershipRole, RawRole } from "./types";

/** Map any raw/legacy role onto the canonical rebuild role model. */
export function normalizeRole(raw: RawRole): MembershipRole | null {
  switch (raw) {
    case "OWNER":
      return "OWNER";
    case "ADMIN": // legacy classroom admin == owner/teacher
      return "OWNER";
    case "TEACHER":
      return "TEACHER";
    case "CO_TEACHER":
    case "TA":
      return "TA";
    case "STUDENT":
      return "STUDENT";
    default:
      return null; // REMOVED / unknown → no membership capabilities
  }
}

const STAFF: ReadonlySet<MembershipRole> = new Set(["OWNER", "TEACHER", "TA"]);

export interface Capabilities {
  isMember: boolean;
  isStaff: boolean; // TA + Teacher + Owner
  isStudent: boolean;
  isOwner: boolean;
  // Instructional — TA + Teacher + Owner
  canManageAssignments: boolean; // create/edit/publish/archive (NOT delete)
  canGrade: boolean;
  canTakeAttendance: boolean;
  canPostAnnouncement: boolean;
  canViewClassAnalytics: boolean;
  canRecomputeRanking: boolean;
  // Governance — Teacher + Owner
  canManageClass: boolean; // settings, deactivate, join code
  canDeleteAssignment: boolean;
  canManageRoster: boolean; // add/remove students
  canConfigureRanking: boolean; // weights + visibility
  // Owner only
  canAssignTa: boolean;
  canDeleteClass: boolean;
}

export function capabilitiesFor(raw: RawRole): Capabilities {
  const role = normalizeRole(raw);
  const isMember = role != null;
  const isStaff = role != null && STAFF.has(role);
  const isStudent = role === "STUDENT";
  const isManager = role === "OWNER" || role === "TEACHER";
  const isOwner = role === "OWNER";
  return {
    isMember,
    isStaff,
    isStudent,
    isOwner,
    canManageAssignments: isStaff,
    canGrade: isStaff,
    canTakeAttendance: isStaff,
    canPostAnnouncement: isStaff,
    canViewClassAnalytics: isStaff,
    canRecomputeRanking: isStaff,
    canManageClass: isManager,
    canDeleteAssignment: isManager,
    canManageRoster: isManager,
    canConfigureRanking: isManager,
    canAssignTa: isOwner,
    canDeleteClass: isOwner,
  };
}

export const ROLE_LABEL: Record<MembershipRole, string> = {
  OWNER: "Owner",
  TEACHER: "Teacher",
  TA: "Teaching Assistant",
  STUDENT: "Student",
};
