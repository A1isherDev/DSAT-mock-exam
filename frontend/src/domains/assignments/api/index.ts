/**
 * Domain API: Assignments
 *
 * Assignment CRUD across all classrooms.
 * This is the ops console entry point for assignment management.
 *
 * Key invariants enforced here:
 *   - Assignments are always scoped to a specific classroom
 *   - Once an assignment leaves DRAFT, its pinned content cannot change
 *   - All mutations emit events (enforced by backend; this layer does not bypass)
 */

import { classesApi } from "@/lib/api";
import type { Classroom, NormalizedList, Assignment } from "@/lib/criticalApiContract";
import type { AssignmentWithContext } from "../types";

/**
 * List all assignments across all classrooms the current user manages.
 * Used by the ops assignments dashboard.
 *
 * @note This performs N requests (one per classroom). Acceptable for
 *       typical classroom counts (<50). Future: backend-provided aggregate endpoint.
 */
export async function listAllAssignments(): Promise<AssignmentWithContext[]> {
  const classroomList: NormalizedList<Classroom> = await classesApi.list();
  const managed = classroomList.items.filter(
    (c) => (c as Classroom & { my_role?: string }).my_role === "ADMIN",
  );

  const out: AssignmentWithContext[] = [];

  await Promise.allSettled(
    managed.map(async (classroom) => {
      try {
        const assignments: NormalizedList<Assignment> = await classesApi.listAssignments(classroom.id);
        for (const a of assignments.items) {
          out.push({
            ...a,
            classroomId: classroom.id,
            classroomName: classroom.name ?? `Class #${classroom.id}`,
            subject: (classroom as Classroom & { subject?: string }).subject,
          });
        }
      } catch {
        // Individual classroom failures don't abort the whole list
      }
    }),
  );

  // Sort: most recently created first, then by due date
  out.sort((a, b) => {
    const da = a.due_at ? new Date(a.due_at).getTime() : 0;
    const db = b.due_at ? new Date(b.due_at).getTime() : 0;
    return db - da;
  });

  return out;
}

/**
 * List assignments for a single classroom.
 */
export async function listClassroomAssignments(
  classroomId: number,
): Promise<NormalizedList<Assignment>> {
  return classesApi.listAssignments(classroomId);
}

/**
 * Create an assignment in a classroom.
 * The payload must include a reference to the content being assigned.
 */
export async function createAssignment(
  classroomId: number,
  payload: Record<string, unknown>,
): Promise<Assignment> {
  return classesApi.createAssignment(classroomId, payload) as Promise<Assignment>;
}

/**
 * Update an assignment (only allowed in DRAFT state; backend enforces).
 */
export async function updateAssignment(
  classroomId: number,
  assignmentId: number,
  payload: Record<string, unknown>,
): Promise<Assignment> {
  return classesApi.updateAssignment(classroomId, assignmentId, payload) as Promise<Assignment>;
}

/**
 * Delete (cancel) an assignment.
 * Backend enforces: only DRAFT and SCHEDULED assignments can be deleted.
 * ACTIVE/COMPLETED assignments must be archived through the state machine.
 */
export async function deleteAssignment(
  classroomId: number,
  assignmentId: number,
): Promise<void> {
  return classesApi.deleteAssignment(classroomId, assignmentId);
}
