import { Suspense } from "react";
import ModuleQuestionsPageInner from "./ModuleQuestionsPageInner";

export default function QuestionsModulePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <ModuleQuestionsPageInner />
    </Suspense>
  );
}
