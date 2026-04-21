"use client";

import AuthGuard from "@/components/AuthGuard";
import AssignAssessmentContainer from "@/features/assessments/containers/AssignAssessmentContainer";

export default function AssignAssessmentRootPage() {
  return (
    <AuthGuard adminOnly>
      <AssignAssessmentContainer />
    </AuthGuard>
  );
}

