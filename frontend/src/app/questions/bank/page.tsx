"use client";

import { useMemo, useState } from "react";
import QuestionBankFilters from "@/features/questionBank/QuestionBankFilters";
import QuestionRow from "@/features/questionBank/QuestionRow";
import {
  useArchiveStandaloneQuestion,
  useAssignStandaloneQuestionToModule,
  useQuestionBankCategories,
  useQuestionBankQuestions,
} from "@/features/questionBank/hooks";
import type { ActiveFilter, SubjectFilter } from "@/features/questionBank/types";

export default function QuestionBankPage() {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [subject, setSubject] = useState<SubjectFilter>("all");
  const [isActive, setIsActive] = useState<ActiveFilter>("1");

  const catsQ = useQuestionBankCategories();
  const questionsQ = useQuestionBankQuestions({ q, categoryId, subject, isActive });
  const archiveM = useArchiveStandaloneQuestion();
  const assignM = useAssignStandaloneQuestionToModule();

  const categories = catsQ.data || [];
  const questions = questionsQ.data || [];

  const title = useMemo(() => {
    const parts = ["Question bank"];
    if (isActive === "1") parts.push("(active)");
    if (isActive === "0") parts.push("(archived)");
    return parts.join(" ");
  }, [isActive]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <div className="text-lg font-semibold">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Standalone questions you can archive and assign into modules.
        </div>
      </div>

      <QuestionBankFilters
        q={q}
        onQChange={setQ}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        subject={subject}
        onSubjectChange={setSubject}
        isActive={isActive}
        onIsActiveChange={setIsActive}
        categories={categories}
      />

      <div className="mt-4 rounded border">
        {questionsQ.isLoading ? (
          <div className="p-4 text-sm">Loading questions…</div>
        ) : questionsQ.isError ? (
          <div className="p-4 text-sm text-red-600">Failed to load questions.</div>
        ) : questions.length === 0 ? (
          <div className="p-4 text-sm">
            {q || categoryId !== "all" || subject !== "all" || isActive !== "all" ? (
              <>
                <div className="font-semibold">No results.</div>
                <div className="mt-1 text-muted-foreground">Try changing your filters or search.</div>
              </>
            ) : (
              <>
                <div className="font-semibold">No questions yet.</div>
                <div className="mt-1 text-muted-foreground">
                  Create questions in a module first, or add standalone question creation later.
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {questions.map((qq) => (
              <QuestionRow
                key={qq.id}
                q={qq}
                categories={categories}
                onArchiveToggle={async (questionId, nextActive) => {
                  await archiveM.mutateAsync({ questionId, isActive: nextActive });
                }}
                onAssign={async ({ testId, moduleId, questionId }) => {
                  return await assignM.mutateAsync({ testId, moduleId, questionId });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {(archiveM.isPending || assignM.isPending) && (
        <div className="mt-3 text-xs text-muted-foreground">Saving…</div>
      )}
    </div>
  );
}

