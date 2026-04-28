"use client";

import { useEffect, useState } from "react";
import { usersApi } from "@/lib/api";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";

export default function SecurityPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof usersApi.getSecurity>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await usersApi.getSecurity();
        if (!cancelled) setData(d);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load security data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading security…
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {err ?? "Something went wrong."}
      </div>
    );
  }

  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent account security events and adaptive protection status.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">Last password change</p>
          <p className="mt-2 text-lg font-medium">{fmt(data.last_password_change)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">Suspicious activity (7 days)</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-medium">
            {data.suspicious_login_alerts > 0 ? (
              <>
                <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden />
                {data.suspicious_login_alerts} event{data.suspicious_login_alerts === 1 ? "" : "s"}
              </>
            ) : (
              <>
                <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden />
                None flagged
              </>
            )}
          </p>
        </div>
      </section>

      {data.security_step_up_active ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
          <strong>Extra sign-in required.</strong> Please sign out and sign in again with your password (or Google /
          Telegram) to restore full access. This is a temporary protection after unusual session activity.
        </div>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Recent events</h2>
        {data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No security events recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.events.map((ev) => (
              <li
                key={ev.id}
                className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{ev.event_type.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{fmt(ev.created_at)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {ev.severity}
                  {ev.ip ? ` · ${ev.ip}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
