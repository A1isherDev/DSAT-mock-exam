"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Search, UserCheck, UserX, RefreshCw, AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/cn";

type UserRecord = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  subject?: string | null;
  date_joined?: string;
};

type RoleFilter = "all" | "student" | "teacher" | "test_admin" | "admin" | "super_admin";

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

export default function OpsUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      // Uses the admin users list endpoint via base API
      const r = await api.get("/users/admin/list/", {
        params: {
          limit: 200,
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

  const filtered = useMemo(() => {
    let result = users;
    if (search.trim().length >= 2) {
      const term = search.toLowerCase().trim();
      result = result.filter(
        (u) =>
          u.username.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term) ||
          `${u.first_name} ${u.last_name}`.toLowerCase().includes(term),
      );
    }
    if (statusFilter === "active") result = result.filter((u) => u.is_active);
    if (statusFilter === "inactive") result = result.filter((u) => !u.is_active);
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
            Manage student and staff accounts, roles, and access status. Role changes take effect
            immediately.
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

      {/* Permission warning */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <strong>Backend permissions are authoritative.</strong> This interface shows UI-level
          information. All role changes must be confirmed by the backend — an error here means the
          change was rejected server-side.
        </p>
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
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name, email, or username…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2 text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as RoleFilter);
            setPage(1);
          }}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold"
        >
          <option value="all">All roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="test_admin">Test admins</option>
          <option value="admin">Admins</option>
          <option value="super_admin">Super admins</option>
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as "all" | "active" | "inactive");
            setPage(1);
          }}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between gap-2">
          <p className="font-bold text-foreground">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((u) => {
                  const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ");
                  const roleColor = ROLE_COLORS[u.role] ?? "bg-slate-100 text-slate-700";
                  const roleLabel = ROLE_LABELS[u.role] ?? u.role;
                  return (
                    <tr key={u.id} className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-bold text-foreground">
                          {fullName || u.username}
                        </p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                        {fullName && (
                          <p className="text-xs text-muted-foreground font-mono">{u.username}</p>
                        )}
                        {/* Role shown inline on mobile */}
                        <div className="mt-1 sm:hidden">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
                              roleColor,
                            )}
                          >
                            {roleLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
                            roleColor,
                          )}
                        >
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
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                            <UserCheck className="h-3.5 w-3.5" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
                            <UserX className="h-3.5 w-3.5" />
                            Inactive
                          </span>
                        )}
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
    </div>
  );
}
