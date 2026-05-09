/**
 * Shared operational UI primitives for admin.mastersat.uz.
 *
 * Rules:
 *   - No business logic — pure display.
 *   - No API calls — receive data as props.
 *   - All components are exported as named exports.
 *   - Keep the surface small; resist adding props until actually needed.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

// ─── OpsEmptyState ────────────────────────────────────────────────────────────

export function OpsEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/40 mb-3" />
      <p className="font-bold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ─── OpsSignalCard ────────────────────────────────────────────────────────────

export function OpsSignalCard({
  value,
  label,
  accent = false,
  warning = false,
}: {
  value: number | string;
  label: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        warning && Number(value) > 0
          ? "border-amber-200 bg-amber-50"
          : "border-border bg-card",
      )}
    >
      <p
        className={cn(
          "text-2xl font-extrabold tabular-nums",
          warning && Number(value) > 0
            ? "text-amber-700"
            : accent
              ? "text-primary"
              : "text-foreground",
        )}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p
        className={cn(
          "mt-1 text-xs font-semibold",
          warning && Number(value) > 0 ? "text-amber-700" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
    </div>
  );
}

// ─── OpsAttentionBanner ───────────────────────────────────────────────────────

type AttentionSeverity = "critical" | "warning" | "ok";

const SEVERITY_STYLES: Record<
  AttentionSeverity,
  { border: string; bg: string; iconWrap: string; badge: string; arrow: string }
> = {
  critical: {
    border: "border-red-200",
    bg: "bg-red-50 hover:bg-red-100/80",
    iconWrap: "text-red-600 bg-red-100",
    badge: "bg-red-100 text-red-700",
    arrow: "text-red-700",
  },
  warning: {
    border: "border-amber-200",
    bg: "bg-amber-50 hover:bg-amber-100/80",
    iconWrap: "text-amber-600 bg-amber-100",
    badge: "bg-amber-100 text-amber-700",
    arrow: "text-amber-700",
  },
  ok: {
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    iconWrap: "text-emerald-600 bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-700",
    arrow: "text-emerald-700",
  },
};

export function OpsAttentionBanner({
  icon: Icon,
  count,
  label,
  description,
  href,
  severity,
}: {
  icon: React.ElementType;
  count?: number;
  label: string;
  description: string;
  href?: string;
  severity: AttentionSeverity;
}) {
  const s = SEVERITY_STYLES[severity];

  const inner = (
    <div className={`flex items-start gap-3 rounded-2xl border ${s.border} ${s.bg} px-4 py-3 transition-colors`}>
      <div className={`shrink-0 rounded-xl p-2 mt-0.5 ${s.iconWrap}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        {count != null && severity !== "ok" && (
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`text-xs font-black rounded-full px-2 py-0.5 tabular-nums ${s.badge}`}>
              {count}
            </span>
            <span className="text-sm font-bold text-foreground">{label}</span>
          </div>
        )}
        {(count == null || severity === "ok") && (
          <p className="text-sm font-semibold text-emerald-800 flex-1">{description}</p>
        )}
        {severity !== "ok" && (
          <p className="text-xs text-muted-foreground leading-snug">{description}</p>
        )}
      </div>
      {severity === "ok" ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
      ) : href ? (
        <ArrowRight className={`h-4 w-4 shrink-0 mt-1 ${s.arrow}`} />
      ) : null}
    </div>
  );

  if (href && severity !== "ok") {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}

// ─── OpsSectionHeader ─────────────────────────────────────────────────────────

export function OpsSectionHeader({
  label,
  count,
  action,
}: {
  label: string;
  count?: number;
  action?: { label: string; onClick: () => void; variant?: "primary" | "ghost" };
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        {count != null && (
          <span className="text-[10px] font-black tabular-nums text-muted-foreground">
            ({count})
          </span>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors",
            action.variant === "primary"
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border border-border bg-card text-foreground hover:bg-surface-2",
          )}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ─── OpsStatusBadge ───────────────────────────────────────────────────────────

type BadgeVariant = "overdue" | "active" | "done" | "pending" | "warning" | "muted";

const BADGE_STYLES: Record<BadgeVariant, string> = {
  overdue: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  done: "bg-emerald-100 text-emerald-700",
  pending: "bg-blue-100 text-blue-700",
  warning: "bg-red-100 text-red-700",
  muted: "bg-surface-2 text-muted-foreground",
};

export function OpsStatusBadge({
  label,
  variant,
}: {
  label: string;
  variant: BadgeVariant;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
        BADGE_STYLES[variant],
      )}
    >
      {label}
    </span>
  );
}

// ─── OpsDataRow ───────────────────────────────────────────────────────────────

export function OpsDataRow({
  left,
  right,
  className,
  onClick,
}: {
  left: ReactNode;
  right?: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors",
        onClick && "cursor-pointer hover:bg-surface-2/50",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{left}</div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ─── OpsListCard ─────────────────────────────────────────────────────────────

/** Wraps a list of rows in the standard rounded-card + divide-y container. */
export function OpsListCard({
  header,
  children,
  className,
}: {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>
      {header && (
        <div className="border-b border-border px-4 py-3">{header}</div>
      )}
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

// ─── OpsPageHeader ────────────────────────────────────────────────────────────

export function OpsPageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <div>
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
