"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usersApi } from "@/lib/api";
import {
  CalendarClock,
  Copy,
  Loader2,
  Pencil,
  Sparkles,
  Target,
  Trophy,
  X,
  UserCircle,
} from "lucide-react";

type MeForm = {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  sat_exam_date: string;
  target_score: string;
  profile_image_url: string | null;
};

function mapMeToForm(me: any): MeForm {
  return {
    username: me.username || "",
    first_name: me.first_name || "",
    last_name: me.last_name || "",
    email: me.email || "",
    sat_exam_date: me.sat_exam_date || "",
    target_score: me.target_score != null ? String(me.target_score) : "",
    profile_image_url: me.profile_image_url || null,
  };
}

export default function ProfilePage() {
  const [me, setMe] = useState<MeForm | null>(null);
  const [draft, setDraft] = useState<MeForm | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [clearPhoto, setClearPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await usersApi.getMe();
        if (!cancelled) setMe(mapMeToForm(me));
      } catch {
        if (!cancelled) setMessage("Could not load your profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const previewUrl = objectUrl || (!clearPhoto ? draft?.profile_image_url : null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        username: draft.username.trim(),
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        email: draft.email.trim(),
        sat_exam_date: draft.sat_exam_date || null,
        target_score: draft.target_score.trim() ? parseInt(draft.target_score, 10) : null,
      };
      if (clearPhoto && !file) {
        payload.clear_profile_image = true;
      }

      let latest = await usersApi.patchMe(payload);
      if (file) {
        const fd = new FormData();
        fd.append("profile_image", file);
        latest = await usersApi.patchMe(fd);
      }

      const updated = mapMeToForm(latest);
      setMe(updated);
      setFile(null);
      setClearPhoto(false);
      setDraft(null);
      setMessage("Saved.");
      setEditOpen(false);
    } catch (err: any) {
      const d = err?.response?.data;
      const text =
        typeof d === "object" && d
          ? Object.entries(d)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
              .join(" ")
          : "Could not save changes.";
      setMessage(text);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: string) => {
    if (!d) return "";
    try {
      return new Date(d).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  const daysUntil = (d: string) => {
    if (!d) return null;
    const target = new Date(d);
    if (Number.isNaN(target.getTime())) return null;
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const profileCompletion = (m: MeForm) => {
    const fields = [
      !!m.username?.trim(),
      !!m.first_name?.trim(),
      !!m.last_name?.trim(),
      !!m.email?.trim(),
      m.target_score != null && m.target_score !== "",
      !!m.sat_exam_date,
      !!m.profile_image_url,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  };

  const completion = me ? profileCompletion(me) : 0;
  const targetScore = me?.target_score ? Math.max(0, Math.min(1600, parseInt(me.target_score, 10))) : null;
  const nextDays = me?.sat_exam_date ? daysUntil(me.sat_exam_date) : null;

  const handleOpenEdit = () => {
    setDraft(me);
    setFile(null);
    setObjectUrl(null);
    setClearPhoto(false);
    setSaving(false);
    setMessage(null);
    setEditOpen(true);
  };

  const handleCloseEdit = () => {
    setEditOpen(false);
    setDraft(null);
    setFile(null);
    setObjectUrl(null);
    setClearPhoto(false);
    setSaving(false);
    setMessage(null);
  };

  useEffect(() => {
    if (!editOpen) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") handleCloseEdit();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen]);

  if (loading || !me) {
    return (
      <div className="max-w-xl mx-auto px-8 py-20 flex justify-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 lg:px-10 lg:py-12">
      {/* Cover */}
      <div className="hero-shell relative p-8 md:p-10 min-h-[280px]">
        <div className="flex items-start justify-between gap-6">
          <div className="max-w-2xl">
            <p className="eyebrow mb-2">Profile</p>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">Futuristic profile dashboard</h1>
            <p className="text-slate-600 mt-3 max-w-2xl text-base">
              Your goals, readiness, and identity — presented like a modern SaaS command center.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={handleOpenEdit}
              className="btn-primary"
            >
              <Pencil className="w-4 h-4" />
              Edit profile
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(me.username);
                  setMessage("Username copied.");
                  window.setTimeout(() => setMessage(null), 1500);
                } catch {
                  setMessage("Could not copy username.");
                  window.setTimeout(() => setMessage(null), 1500);
                }
              }}
              className="btn-secondary"
            >
              <Copy className="w-4 h-4" />
              Copy
            </button>
          </div>
        </div>

        {/* Avatar overlapping cover */}
        <div className="absolute -bottom-14 left-8 sm:left-10">
          <div className="relative">
            <div className="w-28 h-28 rounded-full overflow-hidden border-[3px] border-white/80 bg-white/20 shadow-[0_18px_48px_rgba(37,99,235,0.25)]">
              {me.profile_image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={me.profile_image_url} alt={`${me.first_name} ${me.last_name}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/10">
                  <UserCircle className="w-16 h-16 text-slate-300" />
                </div>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-10 h-10 rounded-full glass flex items-center justify-center border border-blue-100/60 shadow-sm">
              <Sparkles className="w-4 h-4 text-blue-600" />
            </div>
          </div>
        </div>

        {/* User info */}
        <div className="pt-16 sm:pt-18 pl-0 sm:pl-36">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="text-2xl font-extrabold text-slate-900">{me.first_name} {me.last_name}</div>
                <div className="neo-chip">Student</div>
              </div>
              <div className="text-slate-500 mt-1 text-base">@{me.username}</div>
            </div>
            <Link href="/classes" className="btn-secondary inline-flex items-center justify-center">
              <Trophy className="w-4 h-4" />
              Go to classes
            </Link>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="metric-tile p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Progress</p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-3xl font-extrabold text-slate-900">{completion}%</p>
                <p className="text-sm font-semibold text-slate-500 mb-1">complete</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
          </div>

          <div className="mt-4">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
              <div
                className="h-full bg-blue-600 rounded-full transition-[width] duration-500"
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-600">
            Fill your profile + goals to unlock smoother preparation.
          </p>
        </div>

        <div className="metric-tile p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Score</p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-3xl font-extrabold text-slate-900">
                  {targetScore != null ? targetScore : "—"}
                </p>
                <p className="text-sm font-semibold text-slate-500 mb-1">/ 1600</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-blue-600" />
            </div>
          </div>

          <div className="mt-4">
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
              <div
                className="h-full bg-blue-600 rounded-full transition-[width] duration-500"
                style={{ width: `${targetScore != null ? Math.round((targetScore / 1600) * 100) : 0}%` }}
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-600">
            Your target score guides practice focus.
          </p>
        </div>

        <div className="metric-tile p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Activity</p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-3xl font-extrabold text-slate-900">
                  {nextDays == null ? "—" : nextDays < 0 ? "Done" : nextDays}
                </p>
                <p className="text-sm font-semibold text-slate-500 mb-1">
                  {nextDays == null ? "" : nextDays < 0 ? "days" : "days"}
                </p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <CalendarClock className="w-5 h-5 text-blue-600" />
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-600">
            {me.sat_exam_date
              ? `Next milestone: ${formatDate(me.sat_exam_date)}`
              : "Set your exam date to get a live countdown."}
          </p>
        </div>
      </div>

      {message && (
        <div className="mt-5 p-4 rounded-2xl border border-blue-100 bg-blue-50/50 text-blue-700 text-sm font-semibold">
          {message}
        </div>
      )}

      {/* Modal */}
      {editOpen && draft && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={handleCloseEdit}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-2xl" role="dialog" aria-modal="true" aria-label="Edit profile">
            <div className="hero-shell p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow mb-2">Edit profile</p>
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-900">Update your identity & goals</h2>
                  <p className="text-slate-600 text-sm mt-2">
                    Photo updates are instant. Other fields save when you confirm.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="btn-secondary inline-flex items-center justify-center !px-3 !py-2"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/70 bg-white/10 shadow-[0_18px_48px_rgba(37,99,235,0.25)]">
                    {previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={previewUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-white/10">
                        <UserCircle className="w-14 h-14 text-slate-300" />
                      </div>
                    )}
                  </div>

                  <label className="text-sm font-semibold text-blue-700 cursor-pointer hover:underline transition-colors">
                    Choose photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        setFile(f || null);
                        setClearPhoto(false);
                      }}
                    />
                  </label>

                  {draft.profile_image_url && (
                    <label className="flex items-center gap-2 text-xs text-slate-700 bg-white/20 px-3 py-1.5 rounded-full border border-blue-100/60">
                      <input
                        type="checkbox"
                        checked={clearPhoto}
                        onChange={(e) => {
                          setClearPhoto(e.target.checked);
                          if (e.target.checked) setFile(null);
                        }}
                      />
                      Remove photo
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Username</label>
                    <input
                      className="input-modern"
                      value={draft.username}
                      onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                      required
                      minLength={3}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
                    <input
                      type="email"
                      className="input-modern"
                      value={draft.email}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">First name</label>
                    <input
                      className="input-modern"
                      value={draft.first_name}
                      onChange={(e) => setDraft({ ...draft, first_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Last name</label>
                    <input
                      className="input-modern"
                      value={draft.last_name}
                      onChange={(e) => setDraft({ ...draft, last_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">SAT exam date</label>
                    <input
                      type="date"
                      className="input-modern"
                      value={draft.sat_exam_date}
                      onChange={(e) => setDraft({ ...draft, sat_exam_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Target score (400–1600)</label>
                    <input
                      type="number"
                      min={400}
                      max={1600}
                      className="input-modern"
                      value={draft.target_score}
                      onChange={(e) => setDraft({ ...draft, target_score: e.target.value })}
                      placeholder="e.g. 1400"
                    />
                  </div>
                </div>

                {message && <p className="text-sm text-slate-700">{message}</p>}

                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={handleCloseEdit} className="btn-secondary" disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>Save changes</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
