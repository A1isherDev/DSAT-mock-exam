"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { examsAdminApi } from "@/lib/api";
import { questionBankKeys } from "./queryKeys";
import type { ActiveFilter, AdminCategory, AdminStandaloneQuestion, SubjectFilter } from "./types";

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: T[] }).results;
  }
  return [];
}

export function useQuestionBankCategories() {
  return useQuery({
    queryKey: questionBankKeys.categories(),
    queryFn: async () => unwrapList<AdminCategory>(await examsAdminApi.getCategoriesAdmin()),
    staleTime: 0,
  });
}

export function useQuestionBankQuestions(args: {
  q: string;
  categoryId: number | "all";
  subject: SubjectFilter;
  isActive: ActiveFilter;
}) {
  return useQuery({
    queryKey: questionBankKeys.list(args),
    queryFn: async () =>
      unwrapList<AdminStandaloneQuestion>(
        await examsAdminApi.listStandaloneQuestions({
          standalone: "1",
          q: args.q || undefined,
          category: args.categoryId,
          subject: args.subject,
          is_active: args.isActive,
        }),
      ),
    staleTime: 0,
  });
}

export function useQuestionBankTests() {
  return useQuery({
    queryKey: questionBankKeys.tests(),
    queryFn: async () => unwrapList<{ id: number; title?: string }>(await examsAdminApi.getPracticeTestsAdmin(true)),
    staleTime: 0,
  });
}

export function useQuestionBankModules(testId: number) {
  return useQuery({
    queryKey: questionBankKeys.modules(testId),
    queryFn: async () => unwrapList<{ id: number; module_order: number }>(await examsAdminApi.getModules(testId)),
    enabled: Number.isFinite(testId) && testId > 0,
    staleTime: 0,
  });
}

export function useArchiveStandaloneQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { questionId: number; isActive: boolean }) => {
      return await examsAdminApi.updateStandaloneQuestion(args.questionId, { is_active: args.isActive });
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: questionBankKeys.all });
    },
  });
}

export function useAssignStandaloneQuestionToModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { testId: number; moduleId: number; questionId: number }) => {
      return await examsAdminApi.assignStandaloneQuestionToModule(args.testId, args.moduleId, {
        question_id: args.questionId,
      });
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: questionBankKeys.all });
    },
  });
}

