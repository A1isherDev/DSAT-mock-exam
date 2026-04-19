"use client";

import HomeworkGradingHub from "@/components/homework/HomeworkGradingHub";

export default function TeacherHomeworkGradingHubPage() {
  return (
    <HomeworkGradingHub
      basePath="/teacher/homework/grading"
      homeworkManagementHref="/teacher/homework"
      homeworkManagementLabel="Homework management"
    />
  );
}
