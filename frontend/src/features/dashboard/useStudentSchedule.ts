"use client";

/**
 * Student lessons-calendar data layer. Fetches the visible 6-week grid range from
 * GET /api/classes/my-schedule/ and exposes events bucketed by day + the next upcoming
 * lesson (class/mock/midterm). Reuses the existing classesApi client; no other backend work.
 */

import { useEffect, useMemo, useState } from "react";
import { classesApi, type ScheduleEvent } from "@/lib/api";

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The 42-cell (6-week) grid for a month, starting on the Sunday on/before the 1st. */
export function gridRange(year: number, month: number): { start: Date; end: Date } {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41);
  return { start, end };
}

const LESSON_TYPES = new Set(["class", "mock", "midterm"]);

export type StudentSchedule = {
  loading: boolean;
  byDate: Map<string, ScheduleEvent[]>;
  /** ISO date of the next class/mock/midterm on or after today (within the loaded grid). */
  nextLessonDate: string | null;
};

export function useStudentSchedule(year: number, month: number): StudentSchedule {
  const { start, end } = useMemo(() => gridRange(year, month), [year, month]);
  const fromIso = isoDate(start);
  const toIso = isoDate(end);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    classesApi
      .mySchedule(fromIso, toIso)
      .then((r) => { if (!cancelled) setEvents(r.events); })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fromIso, toIso]);

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return m;
  }, [events]);

  const nextLessonDate = useMemo(() => {
    const today = isoDate(new Date());
    const dates = events
      .filter((e) => LESSON_TYPES.has(e.type) && e.date >= today)
      .map((e) => e.date)
      .sort();
    return dates[0] ?? null;
  }, [events]);

  return { loading, byDate, nextLessonDate };
}
