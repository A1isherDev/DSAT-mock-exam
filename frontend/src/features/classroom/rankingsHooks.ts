"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rankingsApi, type LeaderboardMode, type RankingKind } from "./rankingsApi";

const enabledId = (id: number) => Number.isFinite(id) && id > 0;
const keys = {
  board: (c: number, k: RankingKind) => ["classroom", "rankings", c, k] as const,
  history: (c: number, k: RankingKind, s?: number) => ["classroom", "rankings", "history", c, k, s ?? "me"] as const,
};

export function useRankings(classId: number, kind: RankingKind, enabled = true) {
  return useQuery({
    queryKey: keys.board(classId, kind),
    queryFn: () => rankingsApi.get(classId, kind),
    enabled: enabled && enabledId(classId),
  });
}

export function useRankingHistory(classId: number, kind: RankingKind, studentId?: number, enabled = true) {
  return useQuery({
    queryKey: keys.history(classId, kind, studentId),
    queryFn: () => rankingsApi.history(classId, kind, studentId),
    enabled: enabled && enabledId(classId),
  });
}

export function useRecomputeRankings(classId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kinds?: RankingKind[]) => rankingsApi.recompute(classId, kinds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classroom", "rankings", classId] }),
  });
}

export function useUpdateRankingConfig(classId: number, kind: RankingKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { leaderboard_mode?: LeaderboardMode; hide_score_values?: boolean }) =>
      rankingsApi.updateConfig(classId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.board(classId, kind) }),
  });
}
