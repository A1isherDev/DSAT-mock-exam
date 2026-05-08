/**
 * Domain: Classrooms
 * Canonical types for classroom management.
 */

import type { Classroom } from "@/lib/criticalApiContract";

export type { Classroom };

export type ClassroomRole = "ADMIN" | "CO_TEACHER" | "STUDENT" | "REMOVED";

export type ClassroomState = "ACTIVE" | "ARCHIVED";

export type ClassroomWithRole = Classroom & {
  my_role?: ClassroomRole;
  subject?: string;
  student_count?: number;
};
