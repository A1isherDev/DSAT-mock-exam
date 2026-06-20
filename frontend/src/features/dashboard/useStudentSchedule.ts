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
const DEFAULT_LESSON_MIN = 120; // assumed duration when only a start time is known

/** "16:00" / "4:00 PM" / "8" / "9am" → minutes since midnight, or null. */
function parseHM(raw: string): number | null {
  const s = raw.trim();
  let m = /^(\d{1,2}):(\d{2})\s*([ap]m)?$/i.exec(s);
  if (m) {
    let h = Number(m[1]); const min = Number(m[2]); const ap = m[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  m = /^(\d{1,2})\s*([ap]m)$/i.exec(s);
  if (m) {
    let h = Number(m[1]); const ap = m[2].toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23) return null;
    return h * 60;
  }
  return null;
}

/**
 * Local start/end epoch-ms window for an event. A lesson_time may be a single
 * start ("16:00") or a range ("08:00-10:00"). Events with no time (mock/midterm/
 * assignment) occupy the whole day so they stay "next" until the day ends.
 */
function lessonWindow(e: ScheduleEvent): { start: number; end: number } {
  const [y, mo, da] = e.date.split("-").map(Number);
  const base = new Date(y, (mo ?? 1) - 1, da ?? 1, 0, 0, 0, 0).getTime();
  const dayEnd = base + 24 * 60 * 60000 - 60000;
  const t = (e.time ?? "").trim();
  if (!t) return { start: base, end: dayEnd };
  const parts = t.split(/\s*(?:-|–|—|\/|to)\s*/i).map((p) => p.trim()).filter(Boolean);
  const startMin = parseHM(parts[0] ?? "");
  if (startMin == null) return { start: base, end: dayEnd };
  let endMin = parts[1] != null ? parseHM(parts[1]) : null;
  if (endMin == null || endMin <= startMin) endMin = startMin + DEFAULT_LESSON_MIN;
  return { start: base + startMin * 60000, end: base + endMin * 60000 };
}

export type StudentSchedule = {
  loading: boolean;
  byDate: Map<string, ScheduleEvent[]>;
  /** The next class/mock/midterm whose time window hasn't ended yet (null if none). */
  nextLesson: ScheduleEvent | null;
  /** Convenience: nextLesson?.date — used for calendar highlight + default selection. */
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
    // Chronological within a day so same-day lessons read top-to-bottom.
    for (const list of m.values()) list.sort((a, b) => lessonWindow(a).start - lessonWindow(b).start);
    return m;
  }, [events]);

  // Time-aware: the earliest lesson whose window hasn't ended. A lesson earlier
  // today that has finished is skipped, so a second same-day lesson surfaces once
  // the first ends, and a past lesson never lingers as "next".
  const nextLesson = useMemo(() => {
    const now = Date.now();
    return (
      events
        .filter((e) => LESSON_TYPES.has(e.type))
        .map((e) => ({ e, w: lessonWindow(e) }))
        .filter((x) => x.w.end > now)
        .sort((a, b) => a.w.start - b.w.start)[0]?.e ?? null
    );
  }, [events]);

  return { loading, byDate, nextLesson, nextLessonDate: nextLesson?.date ?? null };
}
