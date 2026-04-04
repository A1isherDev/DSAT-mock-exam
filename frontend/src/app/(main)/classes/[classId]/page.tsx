"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { classesApi } from "@/lib/api";
import ClassLeaderboard from "@/components/ClassLeaderboard";
import CreateAssignmentModal from "@/components/CreateAssignmentModal";
import {
  ClipboardList,
  Users,
  Megaphone,
  GraduationCap,
  KeyRound,
  RefreshCcw,
  Trophy,
  Plus,
} from "lucide-react";

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

  const [tab, setTab] = useState<"stream" | "classwork" | "people" | "grades" | "leaderboard">("stream");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [klass, setKlass] = useState<any>(null);
  const isClassAdmin = klass?.my_role === "ADMIN";

  const [posts, setPosts] = useState<any[]>([]);
  const [postText, setPostText] = useState("");

  const [assignments, setAssignments] = useState<any[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);

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
            {klass?.lesson_days ? ` · ${klass.lesson_days}` : ""}
            {klass?.lesson_time ? ` · ${klass.lesson_time}` : ""}
            {klass?.lesson_hours ? ` · ${klass.lesson_hours}h` : ""}
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
        <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")} icon={Trophy} label="Leaderboard" />
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
              {(klass?.room_number || klass?.start_date || klass?.telegram_chat_id) && (
                <div className="mt-4 text-sm text-slate-600 space-y-1">
                  {klass?.room_number ? <p><span className="font-bold">Room:</span> {klass.room_number}</p> : null}
                  {klass?.start_date ? <p><span className="font-bold">Start:</span> {klass.start_date}</p> : null}
                  {klass?.telegram_chat_id ? (
                    <p>
                      <span className="font-bold">Telegram Chat ID:</span> {klass.telegram_chat_id}
                    </p>
                  ) : null}
                </div>
              )}
              {isClassAdmin && (
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

            {isClassAdmin && (
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
        <div className="space-y-6">
          {isClassAdmin ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Classwork</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Topshiriqlar ro‘yxati. Yangi topshiriqni modal orqali qo‘shing — mock va pastpaper ro‘yxatdan tanlanadi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-blue-600/25 hover:from-blue-700 hover:to-indigo-700 transition-all shrink-0"
              >
                <Plus className="w-5 h-5" />
                Topshiriq yaratish
              </button>
            </div>
          ) : (
            <h2 className="text-lg font-extrabold text-slate-900">Classwork</h2>
          )}

          <div className="space-y-4">
            {assignments.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-slate-600 font-medium text-center">
                Hozircha topshiriqlar yo‘q.
                {isClassAdmin ? " «Topshiriq yaratish» tugmasini bosing." : ""}
              </div>
            ) : (
              assignments.map((a) => (
                <Link
                  key={a.id}
                  href={`/classes/${id}/assignments/${a.id}`}
                  className="block bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-extrabold text-slate-900 truncate">{a.title}</p>
                        {a.practice_test ? (
                          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-violet-100 text-violet-800">
                            Pastpaper
                          </span>
                        ) : null}
                        {a.mock_exam ? (
                          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-sky-100 text-sky-800">
                            Mock
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{formatDue(a.due_at)}</p>
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {a.submissions_count ?? 0} yuborilgan
                    </div>
                  </div>
                  {a.instructions ? (
                    <p className="text-sm text-slate-600 mt-3 line-clamp-2">{a.instructions}</p>
                  ) : null}
                </Link>
              ))
            )}
          </div>

          <CreateAssignmentModal
            open={createModalOpen && isClassAdmin}
            classId={id}
            onClose={() => setCreateModalOpen(false)}
            onSuccess={async () => {
              const a = await classesApi.listAssignments(id);
              setAssignments(Array.isArray(a) ? a : []);
              setTab("classwork");
            }}
          />
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
      ) : tab === "leaderboard" ? (
        <ClassLeaderboard classId={id} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-slate-600">
          <p className="font-semibold text-slate-800 mb-2">Grades</p>
          <p className="text-sm">Open a classwork item to review submissions and enter scores. For pastpaper stats and class
            averages, use the <strong>Leaderboard</strong> tab.</p>
        </div>
      )}
    </div>
  );
}

