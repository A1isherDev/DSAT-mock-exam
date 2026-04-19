/**
 * EVEN groups: show concrete weekdays in the header/meta; the weekly card uses "EVEN".
 */
export function formatLessonDaysMeta(lessonDays: string | undefined | null): string {
  if (!lessonDays) return "";
  if (lessonDays === "EVEN") return "Monday, Saturday";
  return lessonDays;
}

/** Leading " · " + meta text, or empty when nothing to show. */
export function lessonDaysMetaSuffix(lessonDays: string | undefined | null): string {
  const d = formatLessonDaysMeta(lessonDays);
  return d ? ` · ${d}` : "";
}

/** Large "Weekly schedule" title: EVEN classes always show EVEN; ODD uses custom summary or a sensible default. */
export function weeklyScheduleTitle(
  lessonDays: string | undefined | null,
  scheduleSummary: string | undefined | null,
): string {
  if (lessonDays === "EVEN") return "EVEN";
  const s = (scheduleSummary || "").trim();
  if (s) return s;
  if (lessonDays === "ODD") return "Monday, Wednesday, Friday";
  return "—";
}
