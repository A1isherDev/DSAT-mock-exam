"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import AuthGuard from "@/components/AuthGuard";
import StudentAttemptRunnerContainer from "@/features/assessments/containers/StudentAttemptRunnerContainer";

export default function AttemptRunnerPage() {
  const router = useRouter();
  const { attemptId } = useParams();
  const id = Number(attemptId);

  useEffect(() => {
    const handler = (e: any) => {
      // We don't know assignmentId here; route back to classes assignment pages typically link by assignment id anyway.
      // If needed we can fetch attempt->homework->assignment id later.
      router.push("/classes");
    };
    window.addEventListener("assessment:submitted", handler as any);
    return () => window.removeEventListener("assessment:submitted", handler as any);
  }, [router]);

  return (
    <AuthGuard>
      <StudentAttemptRunnerContainer attemptId={id} />
    </AuthGuard>
  );
}

