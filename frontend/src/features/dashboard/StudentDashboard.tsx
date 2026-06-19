"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Target,
  CalendarDays,
  ArrowRight,
  TrendingUp,
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
  Badge,
  ProgressRing,
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
          <Link href="/analytics">
            <Button variant="ghost" rightIcon={<ArrowRight />}>Analytics</Button>
          </Link>
        </div>
      </div>

      {/* Hero — readiness + scores + SAT countdown */}
      <HeroPanel model={model} onEditGoal={() => setGoalOpen(true)} />

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

/* ── Hero ───────────────────────────────────────────────────────────────── */
function HeroPanel({ model, onEditGoal }: { model: DashboardModel; onEditGoal: () => void }) {
  const ringTone = model.goalReached ? "text-success" : "text-primary";
  return (
    <Card>
      <CardContent className="grid items-center gap-6 md:grid-cols-[auto_1fr_auto]">
        {/* Readiness ring */}
        <div className="flex items-center gap-5">
          <ProgressRing value={model.readiness ?? 0} size={108} strokeWidth={9} color={ringTone} showLabel={false}>
            <div className="text-center">
              <span className="ds-num block text-2xl font-extrabold leading-none text-foreground">
                {model.readiness != null ? `${model.readiness}%` : "—"}
              </span>
              <span className="ds-overline mt-1 block">Ready</span>
            </div>
          </ProgressRing>
          <div className="md:hidden">
            <HeroNumbers model={model} onEditGoal={onEditGoal} />
          </div>
        </div>

        {/* Numbers (desktop) */}
        <div className="hidden md:block">
          <HeroNumbers model={model} onEditGoal={onEditGoal} />
        </div>

        {/* Exam countdown */}
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground md:w-48">
          <div className="flex items-center gap-2 opacity-90">
            <CalendarDays className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">SAT countdown</span>
          </div>
          <p className="ds-num mt-2 text-4xl font-extrabold leading-none">
            {model.examDaysLeft == null ? "—" : Math.max(0, model.examDaysLeft)}
          </p>
          <p className="mt-1 text-xs font-semibold opacity-90">
            {model.examDaysLeft == null ? "Set your exam date" : "days to go"}
          </p>
          {model.examDate ? (
            <p className="mt-2 text-[11px] opacity-75">
              {new Date(model.examDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function HeroNumbers({ model, onEditGoal }: { model: DashboardModel; onEditGoal: () => void }) {
  // English/Math sub-targets derived from the total goal (matches the design).
  const sub = useMemo(() => {
    if (model.target == null) return null;
    const english = Math.round(model.target / 20) * 10;
    return { english, math: model.target - english };
  }, [model.target]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Metric label="Current" value={model.current ?? "—"} big />
        <Metric label="Projected" value={model.predicted ?? "—"} icon={<TrendingUp className="h-4 w-4 text-success" />} />
        <Metric label="Goal" value={model.target ?? "—"} />
      </div>
      {sub ? (
        <p className="text-[12px] text-muted-foreground">
          Target split — <span className="font-semibold text-foreground">English {sub.english}</span> ·{" "}
          <span className="font-semibold text-foreground">Math {sub.math}</span>
        </p>
      ) : null}
      {model.goalReached ? (
        <Badge variant="success" dot>Goal reached — outstanding work</Badge>
      ) : model.gap != null ? (
        <Badge variant="primary">{model.gap} points to your goal</Badge>
      ) : (
        <button type="button" onClick={onEditGoal} className="ds-ring self-start rounded-lg">
          <Badge variant="neutral">Set a goal to track your gap</Badge>
        </button>
      )}
    </div>
  );
}

function Metric({ label, value, big, icon }: { label: string; value: React.ReactNode; big?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="ds-overline">{label}</p>
      <p className={cn("ds-num flex items-center gap-1.5 font-extrabold tracking-tight text-foreground", big ? "text-4xl" : "text-2xl")}>
        {value}
        {icon}
      </p>
    </div>
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
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h2 className="ds-h4">{monthLabel}</h2>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={prevMonth} aria-label="Previous month"
                className="ds-ring rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
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
                        ? "border-2 border-warning text-warning-foreground"
                        : c.hasClass
                          ? "border-2 border-primary bg-primary-soft text-primary"
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
        <Card>
          <CardContent>
            <p className="ds-overline mb-2 text-primary">Next lesson</p>
            {nextEvents.length === 0 ? (
              <EmptyState compact icon={Sparkles} title="You're all caught up" description="Upcoming lessons will appear here." />
            ) : (
              <>
                <LessonRow event={nextEvents[0]} />
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {nextLessonDate ? new Date(nextLessonDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : ""}
                </p>
              </>
            )}
          </CardContent>
        </Card>

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
    { cls: "border-2 border-primary bg-primary-soft", label: "Class" },
    { cls: "border-2 border-warning", label: "Mock / Midterm" },
    { cls: "bg-primary", label: "Selected / Next" },
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
