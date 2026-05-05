"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { examsAdminApi } from "@/lib/api";
import { questionsModuleKeys } from "./queryKeys";
import type { AdminModuleQuestion } from "./types";

function unwrapQuestionsList(data: unknown): AdminModuleQuestion[] {
  if (Array.isArray(data)) return data as AdminModuleQuestion[];
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: AdminModuleQuestion[] }).results;
  }
  return [];
}

/** Uses backend ordering only (see AdminQuestionViewSet.get_queryset ``order_by``). */
export function useModuleQuestionsQuery(testId: number, moduleId: number) {
  return useQuery({
    queryKey: questionsModuleKeys.list(testId, moduleId),
    queryFn: async () => unwrapQuestionsList(await examsAdminApi.getQuestions(testId, moduleId)),
    enabled: Number.isFinite(testId) && testId > 0 && Number.isFinite(moduleId) && moduleId > 0,
    staleTime: 0,
  });
}

export function useReorderModuleQuestion(testId: number, moduleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { questionId: number; action: "up" | "down" }) => {
      await examsAdminApi.reorderQuestion(testId, moduleId, args.questionId, args.action);
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: questionsModuleKeys.list(testId, moduleId) });
    },
  });
}

/** Backend merges defaults for omitted fields (subject from module's practice test). Send `{}`. */
export function useCreateModuleQuestion(testId: number, moduleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => examsAdminApi.createQuestion(testId, moduleId, {}, false),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: questionsModuleKeys.list(testId, moduleId) });
    },
  });
}
