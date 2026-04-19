"use client";

import { useParams } from "next/navigation";
import HomeworkGradingAssignmentView from "@/components/homework/HomeworkGradingAssignmentView";

export default function ClassGradeHomeworkAssignmentPage() {
  const params = useParams();
  const classId = Number(params.classId);
  const assignmentId = Number(params.assignmentId);

  return (
    <HomeworkGradingAssignmentView basePath="/classes/grade-homework" classId={classId} assignmentId={assignmentId} />
  );
}
