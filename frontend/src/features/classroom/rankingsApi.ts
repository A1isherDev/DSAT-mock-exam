import api from "@/lib/api";

export type RankingKind = "SAT" | "ACADEMIC";
export type LeaderboardMode = "FULL" | "ANONYMOUS" | "HIDDEN";
export type Trend = "IMPROVING" | "STABLE" | "DECLINING";

export interface RankingRow {
  rank: number;
  is_me: boolean;
  name: string;
  score: number | null;
  previous_rank: number | null;
  rank_change: number | null;
  trend: Trend | null;
  percentile: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  components: Record<string, unknown> | null;
}

export interface RankingResponse {
  kind: RankingKind;
  period_key: string | null;
  config: { leaderboard_mode: LeaderboardMode; hide_score_values: boolean };
  can_configure: boolean;
  can_recompute: boolean;
  my: RankingRow | null;
  rows: RankingRow[];
}

export interface RankingHistoryPoint {
  period_key: string;
  rank: number;
  score: number;
  percentile: number | null;
  trend: Trend | null;
  computed_at: string;
}

const base = (classId: number) => `/classes/${classId}/rankings`;

export const rankingsApi = {
  get: async (classId: number, kind: RankingKind): Promise<RankingResponse> =>
    (await api.get(`${base(classId)}/${kind.toLowerCase()}/`)).data,
  history: async (classId: number, kind: RankingKind, studentId?: number): Promise<{ history: RankingHistoryPoint[] }> =>
    (await api.get(`${base(classId)}/${kind.toLowerCase()}/history/`, { params: studentId ? { student: studentId } : {} })).data,
  recompute: async (classId: number, kinds?: RankingKind[]) =>
    (await api.post(`${base(classId)}/recompute/`, kinds ? { kinds } : {})).data,
  updateConfig: async (classId: number, data: { leaderboard_mode?: LeaderboardMode; hide_score_values?: boolean }) =>
    (await api.patch(`${base(classId)}/config/`, data)).data,
};
