"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Cookies from "js-cookie";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import { ClipboardList, Users, Megaphone, GraduationCap, KeyRound, RefreshCcw } from "lucide-react";

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-colors ${
        active ? "bg-blue-50 border-blue-100 text-blue-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

export default function ClassDetailPage() {
  const { classId } = useParams();
  const id = Number(classId);
  const isAdmin = typeof window !== "undefined" && Cookies.get("is_admin") === "true";

  const [tab, setTab] = useState<"stream" | "classwork" | "people" | "grades">("stream");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [klass, setKlass] = useState<any>(null);

  const [posts, setPosts] = useState<any[]>([]);
  const [postText, setPostText] = useState("");

  const [assignments, setAssignments] = useState<any[]>([]);
  const [newAsg, setNewAsg] = useState({
    title: "",
    instructions: "",
    due_at: "",
    external_url: "",
    mock_exam: "",
    practice_test: "",
    module: "",
  });
  const [asgFile, setAsgFile] = useState<File | null>(null);

  const [people, setPeople] = useState<any[]>([]);

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await classesApi.list();
      const found = Array.isArray(list) ? list.find((c) => Number(c.id) === id) : null;
      setKlass(found || { id });
      const [p, a, pe] = await Promise.all([
        classesApi.listPosts(id),
        classesApi.listAssignments(id),
        classesApi.people(id),
      ]);
      setPosts(Array.isArray(p) ? p : []);
      setAssignments(Array.isArray(a) ? a : []);
      setPeople(Array.isArray(pe) ? pe : []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not load class.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handlePost = async () => {
    setError(null);
    try {
      await classesApi.createPost(id, { content: postText });
      setPostText("");
      const p = await classesApi.listPosts(id);
      setPosts(Array.isArray(p) ? p : []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not post.");
    }
  };

  const handleCreateAssignment = async () => {
    setError(null);
    try {
      const fd = new FormData();
      fd.append("title", newAsg.title);
      fd.append("instructions", newAsg.instructions);
      if (newAsg.due_at) fd.append("due_at", newAsg.due_at);
      if (newAsg.external_url) fd.append("external_url", newAsg.external_url);
      if (newAsg.mock_exam) fd.append("mock_exam", String(Number(newAsg.mock_exam)));
      if (newAsg.practice_test) fd.append("practice_test", String(Number(newAsg.practice_test)));
      if (newAsg.module) fd.append("module", String(Number(newAsg.module)));
      if (asgFile) fd.append("attachment_file", asgFile);

      await classesApi.createAssignment(id, fd, true);
      setNewAsg({ title: "", instructions: "", due_at: "", external_url: "", mock_exam: "", practice_test: "", module: "" });
      setAsgFile(null);
      const a = await classesApi.listAssignments(id);
      setAssignments(Array.isArray(a) ? a : []);
      setTab("classwork");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not create assignment.");
    }
  };

  const formatDue = (s?: string) => {
    if (!s) return "No due date";
    try {
      return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return s;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Class</p>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{klass?.name || "Group"}</h1>
          <p className="text-slate-500 mt-2">
            {(klass?.subject ? klass.subject : "")}
            {klass?.lesson_schedule ? ` · ${klass.lesson_schedule}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-sm hover:bg-slate-50"
        >
          <RefreshCcw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2 mb-8">
        <TabButton active={tab === "stream"} onClick={() => setTab("stream")} icon={Megaphone} label="Stream" />
        <TabButton active={tab === "classwork"} onClick={() => setTab("classwork")} icon={ClipboardList} label="Classwork" />
        <TabButton active={tab === "people"} onClick={() => setTab("people")} icon={Users} label="People" />
        <TabButton active={tab === "grades"} onClick={() => setTab("grades")} icon={GraduationCap} label="Grades" />
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 flex justify-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === "stream" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {posts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-slate-600 font-medium">No announcements yet.</div>
            ) : (
              posts.map((p) => (
                <div key={p.id} className="bg-white border border-slate-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-widest mb-3">
                    <span>{p.author?.first_name || p.author?.email || "Admin"}</span>
                    <span>{formatDue(p.created_at)}</span>
                  </div>
                  <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: p.content }} />
                </div>
              ))
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <KeyRound className="w-4 h-4 text-slate-500" />
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Class code</p>
              </div>
              <div className="font-mono text-lg font-black text-slate-900 tracking-wider">{klass?.join_code || "—"}</div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await classesApi.regenerateCode(id);
                    setKlass((k: any) => ({ ...(k || {}), join_code: r?.join_code }));
                  }}
                  className="mt-3 text-xs font-bold text-blue-700 hover:underline"
                >
                  Regenerate code
                </button>
              )}
            </div>

            {isAdmin && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Post announcement</p>
                <textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="Write an announcement (HTML supported)"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm min-h-[120px]"
                />
                <button
                  type="button"
                  onClick={handlePost}
                  disabled={!postText.trim()}
                  className="w-full mt-3 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60"
                >
                  Post
                </button>
              </div>
            )}
          </div>
        </div>
      ) : tab === "classwork" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {assignments.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-slate-600 font-medium">No assignments yet.</div>
            ) : (
              assignments.map((a) => (
                <Link
                  key={a.id}
                  href={`/classes/${id}/assignments/${a.id}`}
                  className="block bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-lg font-extrabold text-slate-900 truncate">{a.title}</p>
                      <p className="text-sm text-slate-500 mt-1">{formatDue(a.due_at)}</p>
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {a.submissions_count ?? 0} submitted
                    </div>
                  </div>
                  {a.instructions ? (
                    <p className="text-sm text-slate-600 mt-3 line-clamp-2">{a.instructions}</p>
                  ) : null}
                </Link>
              ))
            )}
          </div>

          {isAdmin && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Create assignment</p>
              <div className="space-y-3">
                <input
                  value={newAsg.title}
                  onChange={(e) => setNewAsg((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Title"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                />
                <textarea
                  value={newAsg.instructions}
                  onChange={(e) => setNewAsg((p) => ({ ...p, instructions: e.target.value }))}
                  placeholder="Instructions"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm min-h-[100px]"
                />
                <input
                  value={newAsg.due_at}
                  onChange={(e) => setNewAsg((p) => ({ ...p, due_at: e.target.value }))}
                  placeholder="Due date/time (ISO) e.g. 2026-04-01T18:00:00Z"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                />
                <input
                  value={newAsg.external_url}
                  onChange={(e) => setNewAsg((p) => ({ ...p, external_url: e.target.value }))}
                  placeholder="External URL (optional)"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={newAsg.mock_exam}
                    onChange={(e) => setNewAsg((p) => ({ ...p, mock_exam: e.target.value }))}
                    placeholder="MockExam ID"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                  <input
                    value={newAsg.practice_test}
                    onChange={(e) => setNewAsg((p) => ({ ...p, practice_test: e.target.value }))}
                    placeholder="Test ID"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                  <input
                    value={newAsg.module}
                    onChange={(e) => setNewAsg((p) => ({ ...p, module: e.target.value }))}
                    placeholder="Module ID"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest">File (optional)</label>
                <input type="file" onChange={(e) => setAsgFile(e.target.files?.[0] || null)} className="w-full text-sm" />
                <p className="text-[11px] text-slate-400">
                  Attach a file or a link, plus optional test IDs (MVP).
                </p>
              </div>
              <button
                type="button"
                onClick={handleCreateAssignment}
                disabled={!newAsg.title.trim()}
                className="w-full mt-3 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60"
              >
                Create
              </button>
            </div>
          )}
        </div>
      ) : tab === "people" ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 font-bold text-slate-900">Members</div>
          {people.length === 0 ? (
            <div className="p-6 text-slate-600">No members.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {people.map((m) => (
                <div key={m.id} className="p-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">
                      {m.user?.first_name || m.user?.email} {m.user?.last_name || ""}
                    </p>
                    <p className="text-sm text-slate-500 truncate">{m.user?.email}</p>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${m.role === "ADMIN" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-slate-600">
          Grades tab (MVP): open an assignment to see submissions & grading.
        </div>
      )}
    </div>
  );
}

