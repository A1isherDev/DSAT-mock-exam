"use client";

import { useParams } from "next/navigation";
import { AssignmentDetailPage } from "@/features/classroom/pages/AssignmentDetail";

export default function ClassAssignmentPage() {
  const params = useParams();
  const classId = Number(params?.classId);
  const assignmentId = Number(params?.assignmentId);
  return <AssignmentDetailPage classId={classId} assignmentId={assignmentId} />;
}
