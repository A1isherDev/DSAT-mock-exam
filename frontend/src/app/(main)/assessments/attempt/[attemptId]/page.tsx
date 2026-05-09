"use client";

import { useParams } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import StudentAttemptRunnerContainer from "@/features/assessments/containers/StudentAttemptRunnerContainer";

export default function AttemptRunnerPage() {
  const { attemptId } = useParams();
  const id = Number(attemptId);

  // Post-submit navigation is handled inside StudentAttemptRunnerContainer
  // via its CompleteScreen, which links directly to /assessments/result/{assignmentId}.

  return (
    <AuthGuard>
      <StudentAttemptRunnerContainer attemptId={id} />
    </AuthGuard>
  );
}

