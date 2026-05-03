export type PlatformSubject = "MATH" | "READING_WRITING";

export type PastpaperScope = "BOTH" | "MATH" | "READING_WRITING";

export type BulkAssignKind = "pastpaper" | "timed_mock" | "assessment_homework";

export type BulkAssignProfile = {
  subject_grants: { math: boolean; english: boolean };
  classrooms: { id: number; name: string; subject: string }[];
};

export type BulkAssignUserRow = {
  id: number;
  email?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  is_active?: boolean;
  is_frozen?: boolean;
  bulk_assign_profile?: BulkAssignProfile | null;
};

/** GET /api/exams/assignments/history/ row */
export type AssignmentDispatchRow = {
  id: number;
  kind: string;
  subject_summary: string;
  students_requested_count: number;
  students_granted_count: number;
  assigned_by: number | null;
  assigned_by_name: string;
  status: string;
  /** Present on detail responses; list history rows may omit these. */
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  rerun_of?: number | null;
  created_at: string;
};

export type SkippedUserRow = {
  user_id: number;
  username: string;
  display_name: string;
  reason: string;
};

export type LastAssignResult = {
  ok: boolean;
  message?: string;
  dispatch_id?: number;
  dispatch_status?: string;
  students_granted_count?: number;
  students_requested_count?: number;
  students_skipped_count?: number;
  tests_added?: number;
  skipped_users?: SkippedUserRow[];
};
