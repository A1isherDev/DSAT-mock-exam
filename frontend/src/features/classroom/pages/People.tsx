"use client";

import { useState } from "react";
import { Users, UserMinus, GraduationCap } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/cn";
import { normalizeApiError } from "@/lib/apiError";
import { pushGlobalToast } from "@/lib/toastBus";
import { Card, CardHeader, Button, LoadingState, ErrorState, EmptyState, Pill, ConfirmDialog } from "../ui";
import { useClassMembers } from "../hooks";
import { classroomKeys } from "../queryKeys";
import { normalizeRole, ROLE_LABEL, capabilitiesFor } from "../capabilities";
import type { ClassroomWithRole, Member } from "../types";

type PendingAction =
  | { kind: "make-ta"; userId: number; name: string }
  | { kind: "revoke-ta"; userId: number; name: string }
  | { kind: "remove"; userId: number; name: string };

const ACTION_COPY: Record<PendingAction["kind"], { title: string; confirmLabel: string; tone: "primary" | "danger"; body: (name: string) => string; toast: (name: string) => string }> = {
  "make-ta": {
    title: "Make teaching assistant?",
    confirmLabel: "Make TA",
    tone: "primary",
    body: (n) => `${n} will gain instructional access — they can create and grade assignments and mark attendance.`,
    toast: (n) => `${n} is now a TA.`,
  },
  "revoke-ta": {
    title: "Revoke teaching assistant?",
    confirmLabel: "Revoke TA",
    tone: "primary",
    body: (n) => `${n} will return to being a regular student and lose instructional access.`,
    toast: (n) => `${n} is no longer a TA.`,
  },
  remove: {
    title: "Remove student?",
    confirmLabel: "Remove",
    tone: "danger",
    body: (n) => `${n} will lose access to this class and its assignments. You can re-add them with the join code.`,
    toast: (n) => `Removed ${n} from the class.`,
  },
};

function initials(u: Member["user"]): string {
  const a = (u.first_name?.[0] || u.email?.[0] || "?").toUpperCase();
  const b = (u.last_name?.[0] || "").toUpperCase();
  return b ? `${a}${b}` : a;
}
function fullName(u: Member["user"]): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.username || u.email;
}

function useMemberMutation(classId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: number; role?: string; status?: string }) =>
      api.patch(`/classes/${classId}/members/${vars.userId}/`, { role: vars.role, status: vars.status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: classroomKeys.members(classId) }),
  });
}

export function People({ classroom }: { classroom: ClassroomWithRole }) {
  const classId = Number(classroom.id);
  const caps = capabilitiesFor(classroom.my_role);
  const { data, isLoading, isError, refetch } = useClassMembers(classId);
  const mutate = useMemberMutation(classId);
  const [pending, setPending] = useState<PendingAction | null>(null);

  async function runPending() {
    if (!pending) return;
    const vars =
      pending.kind === "make-ta"
        ? { userId: pending.userId, role: "TA" }
        : pending.kind === "revoke-ta"
          ? { userId: pending.userId, role: "STUDENT" }
          : { userId: pending.userId, status: "REMOVED" };
    try {
      await mutate.mutateAsync(vars);
      pushGlobalToast({ tone: "success", message: ACTION_COPY[pending.kind].toast(pending.name) });
      setPending(null);
    } catch (e) {
      pushGlobalToast({ tone: "error", message: normalizeApiError(e).message });
    }
  }

  if (isLoading) return <LoadingState label="Loading people…" />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const members: Member[] = Array.isArray(data) ? data : data?.members ?? [];
  const active = members.filter((m) => normalizeRole(m.role) != null && String((m as { status?: string }).status ?? "ACTIVE") !== "REMOVED");
  const staff = active.filter((m) => normalizeRole(m.role) !== "STUDENT");
  const students = active.filter((m) => normalizeRole(m.role) === "STUDENT");

  const Row = ({ m }: { m: Member }) => {
    const role = normalizeRole(m.role);
    const uid = m.user.id;
    const busy = mutate.isPending;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-foreground">
          {initials(m.user)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fullName(m.user)}</p>
          <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
        </div>
        {role && role !== "STUDENT" && <Pill tone="primary">{ROLE_LABEL[role]}</Pill>}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Assign/revoke TA — Owner only */}
          {caps.canAssignTa && role === "STUDENT" && (
            <Button size="sm" variant="secondary" icon={GraduationCap} disabled={busy} onClick={() => setPending({ kind: "make-ta", userId: uid, name: fullName(m.user) })}>Make TA</Button>
          )}
          {caps.canAssignTa && role === "TA" && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending({ kind: "revoke-ta", userId: uid, name: fullName(m.user) })}>Revoke TA</Button>
          )}
          {/* Remove student — Teacher+Owner */}
          {caps.canManageRoster && role === "STUDENT" && (
            <Button size="sm" variant="ghost" icon={UserMinus} disabled={busy} onClick={() => setPending({ kind: "remove", userId: uid, name: fullName(m.user) })}>Remove</Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Teaching team" description={`${staff.length} ${staff.length === 1 ? "member" : "members"}`} />
        <div className="mt-4 space-y-2">
          {staff.length === 0 ? <EmptyState icon={Users} title="No staff yet" /> : staff.map((m) => <Row key={m.id} m={m} />)}
        </div>
      </Card>
      <Card>
        <CardHeader title="Students" description={`${students.length} enrolled`} />
        <div className={cn("mt-4 grid gap-2", students.length > 6 && "sm:grid-cols-2")}>
          {students.length === 0 ? (
            <EmptyState icon={Users} title="No students yet" description="Share the join code to enroll students." />
          ) : (
            students.map((m) => <Row key={m.id} m={m} />)
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? ACTION_COPY[pending.kind].title : ""}
        description={pending ? ACTION_COPY[pending.kind].body(pending.name) : ""}
        confirmLabel={pending ? ACTION_COPY[pending.kind].confirmLabel : "Confirm"}
        tone={pending ? ACTION_COPY[pending.kind].tone : "primary"}
        loading={mutate.isPending}
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
