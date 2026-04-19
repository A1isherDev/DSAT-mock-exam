"use client";

import HomeworkGradingHub from "@/components/homework/HomeworkGradingHub";

/** Class teachers: list all homework across your groups (same as teacher shell; no staff-only guard). */
export default function ClassGradeHomeworkHubPage() {
  return (
    <HomeworkGradingHub
      basePath="/classes/grade-homework"
      homeworkManagementHref="/classes"
      homeworkManagementLabel="Classes"
    />
  );
}
