"use client";

import { Users, UserMinus, GraduationCap } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/cn";
import { Card, CardHeader, Button, LoadingState, ErrorState, EmptyState, Pill } from "../ui";
import { useClassMembers } from "../hooks";
import { classroomKeys } from "../queryKeys";
import { normalizeRole, ROLE_LABEL, capabilitiesFor } from "../capabilities";
import type { ClassroomWithRole, Member } from "../types";

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
            <Button size="sm" variant="secondary" icon={GraduationCap} disabled={busy} onClick={() => mutate.mutate({ userId: uid, role: "TA" })}>Make TA</Button>
          )}
          {caps.canAssignTa && role === "TA" && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => mutate.mutate({ userId: uid, role: "STUDENT" })}>Revoke TA</Button>
          )}
          {/* Remove student — Teacher+Owner */}
          {caps.canManageRoster && role === "STUDENT" && (
            <Button size="sm" variant="ghost" icon={UserMinus} disabled={busy} onClick={() => mutate.mutate({ userId: uid, status: "REMOVED" })}>Remove</Button>
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
    </div>
  );
}
