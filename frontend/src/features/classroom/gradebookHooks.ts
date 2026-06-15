"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gradebookApi } from "./gradebookApi";

const enabledId = (id: number) => Number.isFinite(id) && id > 0;
const keys = {
  overview: (c: number) => ["classroom", "gradebook", c] as const,
  assignment: (c: number, a: number) => ["classroom", "gradebook", c, a] as const,
};

export function useGradebookOverview(classId: number, enabled = true) {
  return useQuery({
    queryKey: keys.overview(classId),
    queryFn: () => gradebookApi.overview(classId),
    enabled: enabled && enabledId(classId),
  });
}

export function useGradebookAssignment(classId: number, assignmentId: number | null) {
  return useQuery({
    queryKey: keys.assignment(classId, assignmentId ?? 0),
    queryFn: () => gradebookApi.assignment(classId, assignmentId as number),
    enabled: enabledId(classId) && !!assignmentId,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, classId: number, assignmentId: number) {
  qc.invalidateQueries({ queryKey: keys.assignment(classId, assignmentId) });
  qc.invalidateQueries({ queryKey: keys.overview(classId) });
}

export function useGradeSubmission(classId: number, assignmentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, grade, feedback }: { submissionId: number; grade: string; feedback: string }) =>
      gradebookApi.grade(submissionId, { grade, feedback }),
    onSuccess: () => invalidate(qc, classId, assignmentId),
  });
}

export function useReturnSubmission(classId: number, assignmentId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, note }: { submissionId: number; note: string }) =>
      gradebookApi.returnForRevision(submissionId, { note }),
    onSuccess: () => invalidate(qc, classId, assignmentId),
  });
}
