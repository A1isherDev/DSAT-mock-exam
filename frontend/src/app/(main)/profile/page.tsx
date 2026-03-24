"use client";

import { useEffect, useState } from "react";
import { usersApi } from "@/lib/api";
import { UserCircle } from "lucide-react";

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
  const [form, setForm] = useState<MeForm | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [clearPhoto, setClearPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
        if (!cancelled) setForm(mapMeToForm(me));
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

  const previewUrl = objectUrl || (!clearPhoto ? form?.profile_image_url : null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        username: form.username.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        sat_exam_date: form.sat_exam_date || null,
        target_score: form.target_score.trim() ? parseInt(form.target_score, 10) : null,
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

      setForm(mapMeToForm(latest));
      setFile(null);
      setClearPhoto(false);
      setMessage("Saved.");
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

  if (loading || !form) {
    return (
      <div className="max-w-xl mx-auto px-8 py-20 flex justify-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-8 py-12">
      <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Profile</h1>
      <p className="text-slate-500 text-sm mb-8">Your account details and photo.</p>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-slate-200 bg-slate-50 flex items-center justify-center">
            {previewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <UserCircle className="w-16 h-16 text-slate-300" />
            )}
          </div>
          <label className="text-sm font-semibold text-blue-600 cursor-pointer hover:underline">
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
          {form.profile_image_url && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
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

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Username</label>
          <input
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
            minLength={3}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">First name</label>
          <input
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Last name</label>
          <input
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
          <input
            type="email"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">SAT exam date</label>
          <input
            type="date"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            value={form.sat_exam_date}
            onChange={(e) => setForm({ ...form, sat_exam_date: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Target score (400–1600)</label>
          <input
            type="number"
            min={400}
            max={1600}
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
            value={form.target_score}
            onChange={(e) => setForm({ ...form, target_score: e.target.value })}
            placeholder="e.g. 1400"
          />
        </div>

        {message && <p className="text-sm text-slate-700">{message}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
