"use client";

import { useParams } from "next/navigation";
import ModuleQuestionsPanel from "@/features/questionsAdmin/ModuleQuestionsPanel";

export default function ModuleQuestionsPageInner() {
  const params = useParams();
  const rawTest = params.testId;
  const rawModule = params.moduleId;
  const testId = Number(Array.isArray(rawTest) ? rawTest[0] : rawTest);
  const moduleId = Number(Array.isArray(rawModule) ? rawModule[0] : rawModule);

  if (!Number.isFinite(testId) || testId <= 0 || !Number.isFinite(moduleId) || moduleId <= 0) {
    return (
      <div className="p-6 text-sm">
        <p className="font-semibold">Invalid URL.</p>
        <p className="mt-1 text-muted-foreground">
          Expected <code className="rounded bg-muted px-1">/questions/tests/…/modules/…</code>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <ModuleQuestionsPanel testId={testId} moduleId={moduleId} />
    </div>
  );
}
