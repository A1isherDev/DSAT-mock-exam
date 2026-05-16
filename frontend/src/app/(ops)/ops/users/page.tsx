"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import {
  Search,
  UserCheck,
  UserX,
  RefreshCw,
  Users,
  ChevronDown,
  Snowflake,
  ShieldAlert,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

type UserRecord = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  is_frozen: boolean;
  subject?: string | null;
  date_joined?: string;
};

type RoleFilter = "all" | "student" | "teacher" | "test_admin" | "admin" | "super_admin";

const ALL_ROLES = ["student", "teacher", "test_admin", "admin", "super_admin"] as const;

const ROLE_LABELS: Record<string, string> = {
  student: "Student",
  teacher: "Teacher",
  test_admin: "Test admin",
  admin: "Admin",
  super_admin: "Super admin",
};

const ROLE_COLORS: Record<string, string> = {
  student: "bg-blue-100 text-blue-800",
  teacher: "bg-teal-100 text-teal-800",
  test_admin: "bg-amber-100 text-amber-800",
  admin: "bg-purple-100 text-purple-800",
  super_admin: "bg-red-100 text-red-800",
};

function formatDate(s?: string): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

// ─── Inline edit modal ───────────────────────────────────────────────────────

type EditModalProps = {
  user: UserRecord;
  onClose: () => void;
  onSaved: (updated: UserRecord) => void;
};

function EditUserModal({ user, onClose, onSaved }: EditModalProps) {
  const [role, setRole] = useState(user.role);
  const [subject, setSubject] = useState(user.subject ?? "");
  const [isActive, setIsActive] = useState(user.is_active);
  const [isFrozen, setIsFrozen] = useState(user.is_frozen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsSubject = role === "teacher";

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        role,
        is_active: isActive,
        is_frozen: isFrozen,
      };
      if (needsSubject) payload.subject = subject || null;
      else payload.subject = null;

      const r = await api.patch(`/users/${user.id}/update/`, payload);
      onSaved({ ...user, ...r.data, role, is_active: isActive, is_frozen: isFrozen, subject: needsSubject ? subject || null : null });
      onClose();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string; role?: string[] } } })?.response?.data;
      const msg =
        typeof detail?.detail === "string"
          ? detail.detail
          : Array.isArray(detail?.role)
            ? detail.role[0]
            : "Could not save changes.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl bg-card border border-border shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-foreground text-base">
              {[user.first_name, user.last_name].filter(Boolean).join(" ") || user.email}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 hover:bg-surface-2 text-muted-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Role */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Role
          </label>
          <div className="relative">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold appearance-none pr-8"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* Subject — only for teachers */}
        {needsSubject && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Subject
            </label>
            <div className="relative">
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold appearance-none pr-8"
              >
                <option value="">— select —</option>
                <option value="math">Mathematics</option>
                <option value="english">English / Reading & Writing</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        )}

        {/* Status toggles */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Account status
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between rounded-xl border border-border bg-surface-2/50 px-4 py-3 cursor-pointer">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold text-foreground">Active</span>
                <span className="text-xs text-muted-foreground">— can log in</span>
              </div>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded accent-primary"
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-border bg-surface-2/50 px-4 py-3 cursor-pointer">
              <div className="flex items-center gap-2">
                <Snowflake className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-semibold text-foreground">Frozen</span>
                <span className="text-xs text-muted-foreground">— API access blocked</span>
              </div>
              <input
                type="checkbox"
                checked={isFrozen}
                onChange={(e) => setIsFrozen(e.target.checked)}
                className="h-4 w-4 rounded accent-primary"
              />
            </label>
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function OpsUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "frozen">("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const PAGE_SIZE = 50;

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/users/admin/list/", {
        params: {
          limit: 500,
          offset: 0,
          ...(roleFilter !== "all" ? { role: roleFilter } : {}),
        },
      });
      const items: UserRecord[] = Array.isArray(r.data)
        ? r.data
        : Array.isArray(r.data?.results)
          ? r.data.results
          : [];
      setUsers(items);
      setPage(1);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Could not load users. Ensure you have manage_users permission.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  const handleSaved = (updated: UserRecord) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  };

  const filtered = useMemo(() => {
    let result = users;
    if (search.trim().length >= 2) {
      const term = search.toLowerCase().trim();
      result = result.filter(
        (u) =>
          u.username?.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term) ||
          `${u.first_name} ${u.last_name}`.toLowerCase().includes(term),
      );
    }
    if (statusFilter === "active") result = result.filter((u) => u.is_active && !u.is_frozen);
    if (statusFilter === "inactive") result = result.filter((u) => !u.is_active);
    if (statusFilter === "frozen") result = result.filter((u) => u.is_frozen);
    return result;
  }, [users, search, statusFilter]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">
            Admin console · Users
          </p>
          <h1 className="text-xl font-bold text-foreground tracking-tight">User management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Click any user row to edit their role, status, or subject.
          </p>
        </div>
        <button
          type="button"
          onClick={loadUsers}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
          <button
            type="button"
            onClick={loadUsers}
            className="ml-3 underline font-bold hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name, email, or username…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2 text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value as RoleFilter); setPage(1); }}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold"
        >
          <option value="all">All roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="test_admin">Test admins</option>
          <option value="admin">Admins</option>
          <option value="super_admin">Super admins</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="frozen">Frozen</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between gap-2">
          <p className="font-bold text-foreground text-sm">
            {loading
              ? "Loading…"
              : `${filtered.length} user${filtered.length === 1 ? "" : "s"}`}
          </p>
          {!loading && filtered.length !== users.length && (
            <p className="text-xs text-muted-foreground">{users.length} total</p>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">
              {users.length === 0 ? "No users found." : "No users match your filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap hidden sm:table-cell">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap hidden md:table-cell">
                    Subject
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap hidden lg:table-cell">
                    Joined
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((u) => {
                  const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ");
                  const roleColor = ROLE_COLORS[u.role] ?? "bg-slate-100 text-slate-700";
                  const roleLabel = ROLE_LABELS[u.role] ?? u.role;
                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-surface-2/50 transition-colors cursor-pointer"
                      onClick={() => setEditing(u)}
                    >
                      <td className="px-5 py-3">
                        <p className="font-bold text-foreground">
                          {fullName || u.username || u.email}
                        </p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                        {fullName && u.username && (
                          <p className="text-xs text-muted-foreground font-mono">{u.username}</p>
                        )}
                        <div className="mt-1 sm:hidden">
                          <span className={cn("inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide", roleColor)}>
                            {roleLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                        <span className={cn("inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide", roleColor)}>
                          {roleLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                        {u.subject ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                        {formatDate(u.date_joined)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                              <UserCheck className="h-3.5 w-3.5" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
                              <UserX className="h-3.5 w-3.5" /> Inactive
                            </span>
                          )}
                          {u.is_frozen && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                              <Snowflake className="h-3.5 w-3.5" /> Frozen
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditing(u)}
                            className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-surface-2 transition-colors"
                          >
                            Edit
                          </button>
                          {u.is_frozen ? (
                            <button
                              type="button"
                              title="Unfreeze account"
                              onClick={async () => {
                                try {
                                  await api.patch(`/users/${u.id}/update/`, { is_frozen: false });
                                  setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_frozen: false } : x));
                                } catch { /* ignore */ }
                              }}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                              <Snowflake className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Freeze account"
                              onClick={async () => {
                                try {
                                  await api.patch(`/users/${u.id}/update/`, { is_frozen: true });
                                  setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_frozen: true } : x));
                                } catch { /* ignore */ }
                              }}
                              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:bg-surface-2 transition-colors"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-foreground disabled:opacity-40 hover:bg-surface-2 transition-colors"
            >
              ← Previous
            </button>
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-foreground disabled:opacity-40 hover:bg-surface-2 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
