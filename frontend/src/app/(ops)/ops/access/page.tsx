"use client";

/**
 * /ops/access — Centralized access management console.
 *
 * Front-end for the access engine (ResourceAccessGrant). Two tabs:
 *   - Grant access: individual / bulk / classroom grants (subject or resource).
 *   - Manage grants: search, filter, revoke, extend, and view audit history.
 *
 * Backed by /api/access/* (see backend access.views engine API).
 */

import { useState } from "react";
import { KeyRound, ListChecks } from "lucide-react";
import { cn } from "@/lib/cn";
import { GrantPanel } from "@/components/access/GrantPanel";
import { GrantsManager } from "@/components/access/GrantsManager";

type Tab = "grant" | "manage";

export default function OpsAccessPage() {
  const [tab, setTab] = useState<Tab>("grant");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">
          Admin console · Access
        </p>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Access management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant and manage access to past papers, mock exams, practice tests, and assessments —
          by student, in bulk, or per classroom.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        <TabButton active={tab === "grant"} onClick={() => setTab("grant")} icon={KeyRound} label="Grant access" />
        <TabButton active={tab === "manage"} onClick={() => setTab("manage")} icon={ListChecks} label="Manage grants" />
      </div>

      {tab === "grant" ? (
        <GrantPanel onSuccess={() => setRefreshKey((k) => k + 1)} />
      ) : (
        <GrantsManager refreshKey={refreshKey} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
