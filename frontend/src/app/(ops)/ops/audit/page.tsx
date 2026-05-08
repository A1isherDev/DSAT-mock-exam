"use client";

import { ScrollText, Construction } from "lucide-react";

export default function OpsAuditPage() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">
          Admin console · Audit
        </p>
        <h1 className="text-xl font-bold text-foreground tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Immutable record of all platform events — state transitions, role changes, grade
          corrections, rescore events, and administrative actions.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-surface-2 p-2 shrink-0">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Audit architecture</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              The audit event system is defined in the system governance document (Part 8). Events
              are append-only and permanently retained for academic record events. The frontend
              query surface for the audit timeline is planned for Sprint 4 of the operational
              dashboard rollout.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
        <Construction className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-bold text-foreground">Audit timeline coming soon</p>
        <p className="text-sm mt-1 max-w-sm mx-auto">
          The audit log UI is under development. Backend events are being stored — the query and
          display surface will follow.
        </p>
        <p className="text-xs mt-4 text-muted-foreground">
          For immediate audit access, use the Django admin at{" "}
          <code className="font-mono bg-surface-2 px-1 rounded">
            /django-admin/
          </code>
        </p>
      </div>
    </div>
  );
}
