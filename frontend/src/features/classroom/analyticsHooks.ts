"use client";

import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "./analyticsApi";

const enabledId = (id: number) => Number.isFinite(id) && id > 0;

export function useClassAnalytics(classId: number, enabled = true) {
  return useQuery({
    queryKey: ["classroom", "analytics", "class", classId],
    queryFn: () => analyticsApi.class(classId),
    enabled: enabled && enabledId(classId),
    staleTime: 30_000,
  });
}

export function useMyAnalytics(classId: number, enabled = true) {
  return useQuery({
    queryKey: ["classroom", "analytics", "me", classId],
    queryFn: () => analyticsApi.me(classId),
    enabled: enabled && enabledId(classId),
    staleTime: 30_000,
  });
}
