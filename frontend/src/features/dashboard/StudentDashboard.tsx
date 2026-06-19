"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Target,
  CalendarDays,
  ArrowRight,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Users,
  ClipboardList,
  FileText,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Modal,
  Field,
  Input,
  Skeleton,
} from "@/components/ui";
import type { ScheduleEvent } from "@/lib/api";
import { useDashboardData, type DashboardModel } from "./useDashboardData";
import { gridRange, isoDate, useStudentSchedule } from "./useStudentSchedule";

export function StudentDashboard({ previewModel }: { previewModel?: DashboardModel }) {
  const live = useDashboardData();
  const router = useRouter();
  const [goalOpen, setGoalOpen] = useState(false);

  const status = previewModel ? "ready" : live.status;
  const model = previewModel ?? live.model;

  if (status === "booting") return <DashboardSkeleton />;

  if (status === "unauthenticated" || !model) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <GraduationCap className="h-8 w-8" />
            </div>
            <h1 className="ds-h2">Welcome to MasterSAT</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to track your progress, resume tests, and see your analytics.
            </p>
            <Button className="mt-6" fullWidth onClick={() => router.push("/login")}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ds-overline text-primary">Dashboard</p>
          <h1 className="ds-h1 mt-1">Welcome back, {model.firstName}</h1>
          <p className="ds-small mt-1">Your goal, schedule, and next lessons at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" leftIcon={<Target />} onClick={() => setGoalOpen(true)}>
            {model.target != null ? "Update goal" : "Set goal"}
          </Button>
        </div>
      </div>

      {/* Top — target scores + SAT countdown */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <TargetScoresCard model={model} onEditGoal={() => setGoalOpen(true)} />
        <CountdownCard model={model} />
      </div>

      {/* Schedule — monthly calendar + next lesson + selected-day lessons */}
      <ScheduleSection />

      <GoalModal
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        initial={model.target ?? 1400}
        saving={live.savingGoal}
        onSave={async (total) => {
          if (!previewModel) await live.saveGoal(total);
          setGoalOpen(false);
        }}
      />
    </div>
  );
}

/* ── Target scores ──────────────────────────────────────────────────────── */
function TargetScoresCard({ model, onEditGoal }: { model: DashboardModel; onEditGoal: () => void }) {
  const target = model.target;
  const english = target != null ? Math.round(target / 20) * 10 : null;
  const math = target != null && english != null ? target - english : null;
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Target className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Target scores</p>
            <p className="text-[12px] text-muted-foreground">Where you&apos;re aiming on test day</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <ScoreBox label="Overall" value={target} highlight onClick={onEditGoal} />
          <ScoreBox label="English" value={english} onClick={onEditGoal} />
          <ScoreBox label="Math" value={math} onClick={onEditGoal} />
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBox({ label, value, highlight, onClick }: { label: string; value: number | null; highlight?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ds-ring rounded-2xl border p-4 text-left transition-colors",
        highlight ? "border-primary/40 bg-primary-soft" : "border-border bg-surface-2 hover:bg-surface-3",
      )}
    >
      <p className="ds-overline">{label}</p>
      <p className={cn("ds-num mt-1 text-3xl font-extrabold leading-none", highlight ? "text-primary" : "text-foreground")}>
        {value ?? "—"}
      </p>
    </button>
  );
}

/* ── SAT countdown ──────────────────────────────────────────────────────── */
function CountdownCard({ model }: { model: DashboardModel }) {
  return (
    <Card className="relative overflow-hidden bg-primary text-primary-foreground">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
      <span aria-hidden className="pointer-events-none absolute -bottom-12 right-10 h-28 w-28 rounded-full bg-white/5" />
      <CardContent className="relative flex h-full flex-col justify-center">
        <div className="flex items-center gap-2 opacity-90">
          <CalendarDays className="h-4 w-4" />
          <span className="text-[11px] font-bold uppercase tracking-wider">SAT countdown</span>
        </div>
        <p className="ds-num mt-2 text-6xl font-extrabold leading-none">
          {model.examDaysLeft == null ? "—" : Math.max(0, model.examDaysLeft)}
        </p>
        <p className="mt-1 text-sm font-semibold opacity-90">
          {model.examDaysLeft == null ? "Set your exam date" : "days to go"}
        </p>
        {model.examDate ? (
          <p className="mt-2 text-[12px] opacity-75">
            {new Date(model.examDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ── Schedule (calendar + lessons) ──────────────────────────────────────── */
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function ScheduleSection() {
  const today = useMemo(() => new Date(), []);
  const [viewY, setViewY] = useState(today.getFullYear());
  const [viewM, setViewM] = useState(today.getMonth());
  const [selected, setSelected] = useState<string | null>(null);

  const { loading, byDate, nextLessonDate } = useStudentSchedule(viewY, viewM);

  // Default the selected day to the next upcoming lesson once the schedule loads.
  useEffect(() => {
    if (selected == null && nextLessonDate) setSelected(nextLessonDate);
  }, [selected, nextLessonDate]);

  const monthLabel = new Date(viewY, viewM, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayIso = isoDate(today);

  const cells = useMemo(() => {
    const { start } = gridRange(viewY, viewM);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = isoDate(d);
      const events = byDate.get(iso) ?? [];
      return {
        iso,
        day: d.getDate(),
        inMonth: d.getMonth() === viewM,
        isToday: iso === todayIso,
        isSelected: iso === selected,
        isNext: iso === nextLessonDate,
        hasMock: events.some((e) => e.type === "mock" || e.type === "midterm"),
        hasClass: events.some((e) => e.type === "class"),
        hasAssignment: events.some((e) => e.type === "assignment"),
      };
    });
  }, [viewY, viewM, byDate, todayIso, selected, nextLessonDate]);

  const prevMonth = () => setViewM((m) => { if (m === 0) { setViewY((y) => y - 1); return 11; } return m - 1; });
  const nextMonth = () => setViewM((m) => { if (m === 11) { setViewY((y) => y + 1); return 0; } return m + 1; });

  const nextEvents = nextLessonDate ? (byDate.get(nextLessonDate) ?? []) : [];
  const selEvents = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      {/* Calendar */}
      <Card>
        <CardContent>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-foreground">Lesson calendar</p>
                <p className="text-[12px] text-muted-foreground">Tap a day to see what&apos;s on</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={prevMonth} aria-label="Previous month"
                className="ds-ring rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[7.5rem] text-center text-sm font-bold text-foreground">{monthLabel}</span>
              <button type="button" onClick={nextMonth} aria-label="Next month"
                className="ds-ring rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-1 text-[10px] font-bold tracking-wider text-label-foreground">{w}</div>
            ))}
            {cells.map((c) => (
              <button
                key={c.iso}
                type="button"
                disabled={!c.inMonth}
                onClick={() => c.inMonth && setSelected(c.iso)}
                className={cn(
                  "ds-ring flex h-12 items-center justify-center rounded-xl transition-colors",
                  !c.inMonth && "opacity-30",
                  c.inMonth && "hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold",
                    c.isSelected || c.isNext
                      ? "bg-primary text-primary-foreground"
                      : c.hasMock
                        ? "border-2 border-warning text-warning"
                        : c.hasClass
                          ? "border-2 border-primary text-primary"
                          : c.isToday
                            ? "border-2 border-dashed border-primary text-primary"
                            : c.hasAssignment
                              ? "text-primary underline decoration-dotted underline-offset-4"
                              : "text-foreground",
                  )}
                >
                  {c.day}
                </span>
              </button>
            ))}
          </div>

          {loading ? <p className="mt-3 text-[12px] text-muted-foreground">Loading your schedule…</p> : null}
          <Legend />
        </CardContent>
      </Card>

      {/* Next lesson + selected day */}
      <div className="flex flex-col gap-4">
        <NextLessonCard date={nextLessonDate} event={nextEvents[0] ?? null} />

        <Card>
          <CardContent>
            <p className="ds-h4 mb-3">
              {selected
                ? new Date(selected + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                : "Select a day"}
            </p>
            {selEvents.length === 0 ? (
              <EmptyState compact icon={CalendarDays} title="Nothing scheduled" description="No lessons or work on this day." />
            ) : (
              <div className="flex flex-col gap-2">
                {selEvents.map((e, i) => <LessonRow key={i} event={e} />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function relativeDays(iso: string | null): string {
  if (!iso) return "";
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d = new Date(iso + "T00:00:00").getTime();
  const days = Math.round((d - t0) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

function NextLessonCard({ date, event }: { date: string | null; event: ScheduleEvent | null }) {
  if (!event || !date) {
    return (
      <Card>
        <CardContent>
          <p className="ds-overline mb-2 flex items-center gap-1.5 text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" /> Next lesson
          </p>
          <EmptyState compact icon={Sparkles} title="You're all caught up" description="Upcoming lessons will appear here." />
        </CardContent>
      </Card>
    );
  }
  const when = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const href =
    event.type === "assignment" && event.classroom_id
      ? `/classes/${event.classroom_id}/assignments/${event.assignment_id}`
      : event.classroom_id
        ? `/classes/${event.classroom_id}`
        : null;
  const isClass = event.type === "class";
  const cta = isClass ? "Join lesson" : event.type === "assignment" ? "Open assignment" : "View details";
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p className="ds-overline flex items-center gap-1.5 text-primary">
          <span className="h-2 w-2 rounded-full bg-primary" /> Next lesson
        </p>
        <div>
          <p className="ds-h3 leading-tight">{event.title}</p>
          {event.sub ? <p className="mt-0.5 text-sm text-muted-foreground">{event.sub}</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InfoBox label="When" value={when} />
          <InfoBox label="Time" value={event.time || "—"} />
        </div>
        {href ? (
          <Link href={href}>
            <Button fullWidth rightIcon={<ArrowRight />}>
              {cta} · {relativeDays(date)}
            </Button>
          </Link>
        ) : (
          <Button fullWidth disabled rightIcon={<ArrowRight />}>
            {cta} · {relativeDays(date)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <p className="ds-overline">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function eventVisual(type: ScheduleEvent["type"]) {
  switch (type) {
    case "mock":
    case "midterm":
      return { Icon: ClipboardList, wrap: "bg-warning-soft text-warning-foreground" };
    case "assignment":
      return { Icon: FileText, wrap: "bg-info-soft text-info-foreground" };
    default:
      return { Icon: Users, wrap: "bg-primary-soft text-primary" };
  }
}

function LessonRow({ event }: { event: ScheduleEvent }) {
  const { Icon, wrap } = eventVisual(event.type);
  const href =
    event.type === "assignment" && event.classroom_id
      ? `/classes/${event.classroom_id}/assignments/${event.assignment_id}`
      : event.classroom_id
        ? `/classes/${event.classroom_id}`
        : null;
  const body = (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", wrap)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{event.title}</p>
        {event.sub ? <p className="truncate text-[12px] text-muted-foreground">{event.sub}</p> : null}
      </div>
      {event.time ? <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">{event.time}</span> : null}
    </div>
  );
  return href ? <Link href={href} className="ds-ring block rounded-xl transition-colors hover:bg-surface-2">{body}</Link> : body;
}

function Legend() {
  const items = [
    { cls: "border-2 border-primary", label: "Class" },
    { cls: "border-2 border-warning", label: "Mock test" },
    { cls: "bg-primary border-2 border-primary", label: "Next lesson" },
    { cls: "border-2 border-dashed border-primary", label: "Today" },
  ];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn("h-3.5 w-3.5 rounded-full", it.cls)} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ── Goal modal ─────────────────────────────────────────────────────────── */
function GoalModal({
  open,
  onClose,
  initial,
  saving,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: number;
  saving: boolean;
  onSave: (total: number) => void | Promise<void>;
}) {
  const [value, setValue] = useState(String(initial));
  const quick = [1400, 1500, 1550, 1600];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your goal score"
      description="We tailor recommendations and your readiness to it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={() => onSave(Math.max(400, Math.min(1600, Number(value) || 0)))}>
            Save goal
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {quick.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setValue(String(v))}
            className={cn(
              "ds-ring rounded-xl border px-4 py-2 text-sm font-bold transition-colors",
              Number(value) === v
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-foreground hover:bg-surface-2",
            )}
          >
            {v}
          </button>
        ))}
      </div>
      <Field label="Target total (400–1600)" htmlFor="goal-input" hint="The digital SAT is scored 400–1600.">
        <Input
          id="goal-input"
          type="number"
          min={400}
          max={1600}
          step={10}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

/* ── Skeleton ───────────────────────────────────────────────────────────── */
function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-12">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}
