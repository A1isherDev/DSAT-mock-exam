import api from "@/lib/api";

export interface SeriesPoint { period_key: string; score: number; rank: number; computed_at: string }
export interface TopicAccuracy { topic: string; accuracy: number; answered: number }
export interface CompletionHistoryRow {
  assignment_id: number; title: string; category: string; completed: boolean; grade: number | null; max_score: number | null;
}

export interface StudentAnalytics {
  sat_score_trend: SeriesPoint[];
  academic_score_trend: SeriesPoint[];
  ranking_history: { sat: { period_key: string; rank: number }[]; academic: { period_key: string; rank: number }[] };
  attendance_rate: number | null;
  attendance_trend: "IMPROVING" | "STABLE" | "DECLINING";
  completion_rate: number | null;
  best_sat_score: number | null;
  latest_sat_score: number | null;
  recent_performance: CompletionHistoryRow[];
  assignment_completion_history: CompletionHistoryRow[];
}

export interface ClassAnalytics {
  students: number;
  avg_sat_score: number | null;
  avg_academic_score: number | null;
  sat_score_distribution: { range: string; count: number }[];
  academic_score_distribution: { range: string; count: number }[];
  ranking_distribution: { sat: Record<string, number>; academic: Record<string, number> };
  improvement_trends: {
    sat: { trend_counts: Record<string, number>; avg_delta: number | null };
    academic: { trend_counts: Record<string, number>; avg_delta: number | null };
  };
  assignment_completion_rates: { assignment_id: number; title: string; completed: number; students: number; rate: number | null }[];
  submission_rate: number | null;
  attendance: { overall_rate: number | null; students: { student_id: number; name: string; attendance_score: number | null }[]; sessions: { id: number; date: string; present_rate: number | null }[] };
  topics: TopicAccuracy[];
}

const base = (classId: number) => `/classes/${classId}/analytics`;

export const analyticsApi = {
  class: async (classId: number): Promise<ClassAnalytics> => (await api.get(`${base(classId)}/class/`)).data,
  me: async (classId: number): Promise<StudentAnalytics> => (await api.get(`${base(classId)}/me/`)).data,
  student: async (classId: number, studentId: number): Promise<StudentAnalytics> =>
    (await api.get(`${base(classId)}/students/${studentId}/`)).data,
};
