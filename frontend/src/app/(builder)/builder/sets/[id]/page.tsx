"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import BuilderSetEditorContainer from "@/features/assessments/builder/BuilderSetEditorContainer";

export default function BuilderSetDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        </div>
      }
    >
      <BuilderSetEditorContainer />
    </Suspense>
  );
}

