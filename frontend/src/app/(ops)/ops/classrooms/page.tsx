"use client";

import { useEffect, useMemo, useState } from "react";
import { classesApi, examsAdminApi } from "@/lib/api";
import { Search, School, RefreshCw, Users, UserCog, ArrowLeftRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";

// ADMIN GOVERNANCE ONLY. Admins may view all classrooms, assign teacher, transfer ownership,
// and delete. Operational classroom management (create/edit/assign content/materials) lives
// exclusively in the Teacher Portal — there are intentionally no such controls here.

type TeacherDetails = { id: number; email: string; first_name?: string; last_name?: string } | null;
type Row = {
  id: number; name: string; subject?: string; members_count?: number; student_count?: number;
  teacher_details?: TeacherDetails;
};
type TeacherOpt = { id: number; email: string; name: string };

function normList(d: unknown): Row[] {
  if (Array.isArray(d)) return d as Row[];
  const r = (d as { results?: Row[] })?.results;
  return Array.isArray(r) ? r : [];
}

export default function OpsClassroomGovernancePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<TeacherOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ kind: "assign" | "transfer"; row: Row } | null>(null);
  const [pickTeacher, setPickTeacher] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await classesApi.directory();
      setRows(normList(data));
      try {
        const u = await examsAdminApi.getUsers();
        const list = (Array.isArray(u) ? u : (u as { results?: unknown[] })?.results ?? []) as Record<string, unknown>[];
        setTeachers(list.filter((x) => String(x.role).toLowerCase() === "teacher").map((x) => ({
          id: Number(x.id), email: String(x.email),
          name: [x.first_name, x.last_name].filter(Boolean).join(" ").trim() || String(x.email),
        })));
      } catch { /* teacher picker optional */ }
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Could not load the classroom directory (admin only).");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (search.trim().length < 2) return rows;
    const t = search.toLowerCase();
    return rows.filter((c) => (c.name ?? "").toLowerCase().includes(t) || (c.subject ?? "").toLowerCase().includes(t));
  }, [rows, search]);

  function teacherName(td: TeacherDetails) {
    if (!td) return "— Unassigned —";
    return [td.first_name, td.last_name].filter(Boolean).join(" ").trim() || td.email;
  }

  async function submitModal() {
    if (!modal || !pickTeacher) return;
    setBusy(true); setError(null);
    try {
      const uid = Number(pickTeacher);
      if (modal.kind === "assign") await classesApi.assignTeacher(modal.row.id, uid);
      else await classesApi.transferOwnership(modal.row.id, uid);
      setNotice(`${modal.kind === "assign" ? "Teacher assigned" : "Ownership transferred"} for “${modal.row.name}”.`);
      setModal(null); setPickTeacher(""); await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Action failed.");
    } finally { setBusy(false); }
  }

  async function del(row: Row) {
    if (!window.confirm(`Delete classroom “${row.name}”? This cannot be undone.`)) return;
    setBusy(true); setError(null);
    try { await classesApi.governanceDelete(row.id); setNotice(`Deleted “${row.name}”.`); await load(); }
    catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Delete failed.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5">Admin console · Governance</p>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Classroom governance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View all classrooms, assign teachers, transfer ownership, and delete. Operational
            management lives in the Teacher Portal.
          </p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input type="search" placeholder="Search classrooms…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 font-bold text-foreground">
          {loading ? "Loading…" : `${filtered.length} classroom${filtered.length === 1 ? "" : "s"}`}
        </div>
        {loading ? (
          <div className="flex justify-center p-10"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground"><School className="h-8 w-8 mx-auto mb-3 opacity-30" /><p className="font-semibold">No classrooms.</p></div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((c) => (
              <div key={c.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="rounded-xl bg-surface-2 p-2.5 shrink-0"><School className="h-4 w-4 text-muted-foreground" /></div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <p className="font-extrabold text-foreground truncate">{c.name}</p>
                      {c.subject && <span className={cn("inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black uppercase", c.subject.toLowerCase().includes("math") ? "bg-purple-100 text-purple-800" : "bg-teal-100 text-teal-800")}>{c.subject}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>ID #{c.id}</span>
                      <span className="inline-flex items-center gap-1"><UserCog className="h-3 w-3" /> {teacherName(c.teacher_details ?? null)}</span>
                      {typeof (c.members_count ?? c.student_count) === "number" && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{c.members_count ?? c.student_count}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button disabled={busy} onClick={() => { setModal({ kind: "assign", row: c }); setPickTeacher(""); }} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"><UserCog className="h-3.5 w-3.5" /> Assign teacher</button>
                  <button disabled={busy} onClick={() => { setModal({ kind: "transfer", row: c }); setPickTeacher(""); }} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-surface-2 disabled:opacity-50"><ArrowLeftRight className="h-3.5 w-3.5" /> Transfer</button>
                  <button disabled={busy} onClick={() => del(c)} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-500/10 disabled:opacity-50" aria-label={`Delete ${c.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-foreground">{modal.kind === "assign" ? "Assign teacher" : "Transfer ownership"} — {modal.row.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Select a teacher.</p>
            <select value={pickTeacher} onChange={(e) => setPickTeacher(e.target.value)} className="mt-4 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold">
              <option value="">— Choose teacher —</option>
              {teachers.map((t) => <option key={t.id} value={String(t.id)}>{t.name} ({t.email})</option>)}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-surface-2">Cancel</button>
              <button disabled={busy || !pickTeacher} onClick={submitModal} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{busy ? "Working…" : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
