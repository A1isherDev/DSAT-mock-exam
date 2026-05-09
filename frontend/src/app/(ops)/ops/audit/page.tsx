"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import {
  AlertOctagon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  ScrollText,
  Shield,
  User,
} from "lucide-react";
import { cn } from "@/lib/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

type GovernanceEvent = {
  id: number;
  event_type: string;
  entity_type: string;
  entity_id: number;
  actor_email: string | null;
  occurred_at: string;
  correlation_id: string | null;
  payload_summary: Record<string, unknown>;
};

type EventsResponse = {
  count: number;
  limit: number;
  offset: number;
  results: GovernanceEvent[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  publish: "Published",
  publish_idempotent: "Publish (idempotent)",
  publish_validation_failed: "Publish failed",
  supersede: "Superseded",
  assignment_pin: "Assignment pinned",
  attempt_snapshot_pin: "Attempt pinned",
  fallback_path_used: "Fallback path",
  scoring_retried: "Scoring retried",
  force_graded: "Force graded",
  attempt_abandoned: "Abandoned",
  integrity_failure: "Integrity failure",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  publish: "bg-emerald-100 text-emerald-800",
  publish_idempotent: "bg-emerald-50 text-emerald-700",
  publish_validation_failed: "bg-red-100 text-red-800",
  supersede: "bg-blue-100 text-blue-800",
  assignment_pin: "bg-purple-100 text-purple-800",
  attempt_snapshot_pin: "bg-purple-50 text-purple-700",
  fallback_path_used: "bg-amber-100 text-amber-800",
  scoring_retried: "bg-orange-100 text-orange-800",
  force_graded: "bg-orange-100 text-orange-800",
  integrity_failure: "bg-red-100 text-red-800",
};

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function eventBadge(eventType: string) {
  const label = EVENT_TYPE_LABELS[eventType] ?? eventType.replace(/_/g, " ");
  const color = EVENT_TYPE_COLORS[eventType] ?? "bg-surface-2 text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold", color)}>
      {label}
    </span>
  );
}

function payloadSummaryText(summary: Record<string, unknown>): string {
  const parts: string[] = [];
  if (summary.set_title) parts.push(`"${summary.set_title}"`);
  if (summary.version_number != null) parts.push(`v${summary.version_number}`);
  if (summary.question_count != null) parts.push(`${summary.question_count} questions`);
  if (summary.reason) parts.push(String(summary.reason));
  if (summary.description) parts.push(String(summary.description));
  if (summary.source) parts.push(`via ${summary.source}`);
  return parts.join(" · ") || "—";
}

// ─── Filters component ────────────────────────────────────────────────────────

function FilterBar({
  eventType,
  actorEmail,
  onEventTypeChange,
  onActorEmailChange,
  onApply,
}: {
  eventType: string;
  actorEmail: string;
  onEventTypeChange: (v: string) => void;
  onActorEmailChange: (v: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[140px]">
        <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
          Event type
        </label>
        <select
          value={eventType}
          onChange={(e) => onEventTypeChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All events</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
          Actor email
        </label>
        <input
          type="text"
          value={actorEmail}
          onChange={(e) => onActorEmailChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onApply()}
          placeholder="Filter by email…"
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <button
        type="button"
        onClick={onApply}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Filter className="h-3.5 w-3.5" />
        Apply
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OpsAuditPage() {
  const [events, setEvents] = useState<GovernanceEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters (applied on submit, not live)
  const [eventTypeInput, setEventTypeInput] = useState("");
  const [actorEmailInput, setActorEmailInput] = useState("");
  const [activeEventType, setActiveEventType] = useState("");
  const [activeActorEmail, setActiveActorEmail] = useState("");

  const loadEvents = useCallback(
    async (newOffset = 0) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(newOffset));
        if (activeEventType) params.set("event_type", activeEventType);
        if (activeActorEmail) params.set("actor_email", activeActorEmail);

        const r = await api.get(`/assessments/admin/governance-events/?${params}`);
        const d = r.data as EventsResponse;
        setEvents(d.results);
        setTotal(d.count);
        setOffset(newOffset);
      } catch (e: unknown) {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail;
        setError(typeof detail === "string" ? detail : "Could not load audit events.");
      } finally {
        setLoading(false);
      }
    },
    [activeEventType, activeActorEmail],
  );

  useEffect(() => {
    loadEvents(0);
  }, [loadEvents]);

  const applyFilters = () => {
    setActiveEventType(eventTypeInput);
    setActiveActorEmail(actorEmailInput);
    // loadEvents will be called via the useEffect above reacting to state changes
    // But since the state update is async, trigger manually here too
    setOffset(0);
  };

  // When active filters change, reload
  useEffect(() => {
    loadEvents(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEventType, activeActorEmail]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">
            Admin console · Audit
          </p>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Governance audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Immutable record of all publish, pin, scoring, and integrity events. Append-only —
            no event can be deleted or modified.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadEvents(offset)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Architecture note */}
      <div className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
        <div className="rounded-xl bg-surface-2 p-2 shrink-0">
          <Shield className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">Audit architecture: </span>
          Events are written inside publish transactions — failure events persist even when
          transactions roll back. Payload fields are summarised; raw payloads are accessible
          via Django admin for in-depth investigation.
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        eventType={eventTypeInput}
        actorEmail={actorEmailInput}
        onEventTypeChange={setEventTypeInput}
        onActorEmailChange={setActorEmailInput}
        onApply={applyFilters}
      />

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 flex items-start gap-2">
          <AlertOctagon className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Summary bar */}
      {!loading && !error && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ScrollText className="h-4 w-4" />
          <span>
            {total.toLocaleString()} event{total !== 1 ? "s" : ""}
            {activeEventType || activeActorEmail ? " (filtered)" : ""}
          </span>
          {(activeEventType || activeActorEmail) && (
            <button
              type="button"
              onClick={() => {
                setEventTypeInput("");
                setActorEmailInput("");
                setActiveEventType("");
                setActiveActorEmail("");
              }}
              className="text-xs font-bold text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Events table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto_1fr] gap-3 border-b border-border px-5 py-2.5 bg-surface-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Event</p>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Entity</p>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Actor</p>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Time</p>
        </div>

        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto_auto_1fr] gap-3 px-5 py-3.5 animate-pulse"
              >
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-4 w-24 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-foreground">No events found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {activeEventType || activeActorEmail
                ? "Try adjusting your filters."
                : "Governance events will appear here after publish actions."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="grid grid-cols-[1fr_auto_auto_1fr] gap-3 items-start px-5 py-3.5 hover:bg-surface-2/60 transition-colors"
              >
                {/* Event type + summary */}
                <div className="min-w-0">
                  {eventBadge(ev.event_type)}
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {payloadSummaryText(ev.payload_summary)}
                  </p>
                </div>

                {/* Entity */}
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-foreground">{ev.entity_type}</p>
                  <p className="text-xs text-muted-foreground">#{ev.entity_id}</p>
                </div>

                {/* Actor */}
                <div className="text-right shrink-0">
                  {ev.actor_email ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-[120px]">{ev.actor_email}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">system</p>
                  )}
                </div>

                {/* Time */}
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{formatDate(ev.occurred_at)}</p>
                  {ev.correlation_id && (
                    <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 truncate max-w-[120px]">
                      {ev.correlation_id.slice(0, 12)}…
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadEvents(offset - PAGE_SIZE)}
              disabled={!hasPrev}
              className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => loadEvents(offset + PAGE_SIZE)}
              disabled={!hasNext}
              className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
