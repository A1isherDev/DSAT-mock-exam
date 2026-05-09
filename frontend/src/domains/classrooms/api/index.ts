/**
 * Domain API: Classrooms
 */

import { classesApi } from "@/lib/api";
import type { ClassroomWithRole } from "../types";

export async function listClassrooms(): Promise<ClassroomWithRole[]> {
  const data = await classesApi.list();
  return data.items as ClassroomWithRole[];
}

export async function listManagedClassrooms(): Promise<ClassroomWithRole[]> {
  const all = await listClassrooms();
  return all.filter((c) => c.my_role === "ADMIN");
}

export async function getClassroom(classroomId: number) {
  return classesApi.get(classroomId);
}

export async function createClassroom(payload: Parameters<typeof classesApi.create>[0]) {
  return classesApi.create(payload);
}

export async function updateClassroom(classroomId: number, payload: Record<string, unknown>) {
  return classesApi.update(classroomId, payload);
}
