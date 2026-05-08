"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { AlertOctagon, RefreshCw, CheckCircle2, Clock, RotateCcw } from "lucide-react";

type GradingMetrics = {
  pending_scoring: number;
  failed_scoring: number;
  avg_scoring_latency_ms: number | null;
  last_updated: string | null;
};

export default function ScoringIssuesPage() {
  const [metrics, setMetrics] = useState<GradingMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/assessments/admin/grading/metrics/");
      setMetrics(r.data);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Could not load scoring metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">
            Admin console · Scoring
          </p>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Scoring issues</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor the automated scoring pipeline. Failed attempts appear here for investigation
            and retry. Per governance rule, rescoring requires a stated reason and generates an
            audit event.
          </p>
        </div>
        <button
          type="button"
          onClick={loadMetrics}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Governance note */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-50 p-2 shrink-0">
            <AlertOctagon className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Scoring safety protocol</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Automatic retry is attempted up to 3 times. After that, a manual investigation is
              required. Retrying changes the scoring outcome but{" "}
              <strong className="text-foreground">never alters the student&apos;s submitted answers</strong>
              {" "}— those are preserved immutably. Each retry generates a{" "}
              <code className="font-mono bg-surface-2 px-1 rounded text-xs">Attempt.ScoringRetried</code>{" "}
              audit event.
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Metrics cards */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : metrics ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            value={metrics.pending_scoring}
            label="Pending scoring"
            icon={<Clock className="h-5 w-5" />}
            color={metrics.pending_scoring > 50 ? "amber" : "normal"}
          />
          <MetricCard
            value={metrics.failed_scoring}
            label="Failed (need attention)"
            icon={<AlertOctagon className="h-5 w-5" />}
            color={metrics.failed_scoring > 0 ? "red" : "green"}
          />
          <MetricCard
            value={
              metrics.avg_scoring_latency_ms != null
                ? `${Math.round(metrics.avg_scoring_latency_ms)}ms`
                : "—"
            }
            label="Avg scoring latency"
            icon={<CheckCircle2 className="h-5 w-5" />}
            color="normal"
          />
        </div>
      ) : null}

      {/* Failed attempts list placeholder */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4 font-bold text-foreground">
          Failed scoring attempts
        </div>
        <div className="p-8 text-center text-muted-foreground">
          {loading ? (
            <div className="flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : metrics && metrics.failed_scoring === 0 ? (
            <>
              <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-emerald-500" />
              <p className="font-semibold text-foreground">No scoring failures</p>
              <p className="text-sm mt-1">The scoring pipeline is operating normally.</p>
            </>
          ) : (
            <>
              <AlertOctagon className="h-8 w-8 mx-auto mb-3 text-amber-500" />
              <p className="font-semibold text-foreground">
                {metrics?.failed_scoring ?? 0} failed attempt{(metrics?.failed_scoring ?? 0) === 1 ? "" : "s"}
              </p>
              <p className="text-sm mt-1">
                Detailed per-attempt retry interface coming in the scoring dashboard update
                (Sprint 3). Use the Django admin at{" "}
                <code className="font-mono bg-surface-2 px-1 rounded text-xs">
                  /django-admin/assessments/
                </code>{" "}
                for immediate intervention.
              </p>
              <a
                href="/django-admin/assessments/"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Open Django admin
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  value,
  label,
  icon,
  color,
}: {
  value: number | string;
  label: string;
  icon: React.ReactNode;
  color: "normal" | "amber" | "red" | "green";
}) {
  const colorClasses = {
    normal: "text-foreground",
    amber: "text-amber-600",
    red: "text-red-600",
    green: "text-emerald-600",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className={`mb-2 ${colorClasses[color]}`}>{icon}</div>
      <p className={`text-2xl font-extrabold tabular-nums ${colorClasses[color]}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs font-semibold text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
