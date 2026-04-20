"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { vocabularyApi } from "@/lib/api";
import { canManageQuestionsConsole } from "@/lib/permissions";

type VocabWord = {
  id: number;
  word: string;
  meaning: string;
  example: string;
  part_of_speech: string;
  difficulty: number;
  created_at: string;
};

const INPUT =
  "ui-input w-full rounded-xl border border-border bg-surface-2/80 px-3 py-2 text-sm shadow-sm";

export default function AdminVocabularyPage() {
  const allowed = canManageQuestionsConsole();
  const [loading, setLoading] = useState(true);
  const [words, setWords] = useState<VocabWord[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<VocabWord | null>(null);
  const [form, setForm] = useState<Partial<VocabWord>>({
    word: "",
    meaning: "",
    example: "",
    part_of_speech: "other",
    difficulty: 2,
  });

  const fetchWords = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await vocabularyApi.adminListWords()) as VocabWord[];
      setWords(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void fetchWords();
  }, [allowed, fetchWords]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return words;
    return words.filter(
      (w) =>
        w.word.toLowerCase().includes(s) ||
        (w.meaning || "").toLowerCase().includes(s) ||
        (w.example || "").toLowerCase().includes(s),
    );
  }, [q, words]);

  const save = async () => {
    const payload = {
      word: String(form.word || "").trim(),
      meaning: String(form.meaning || ""),
      example: String(form.example || ""),
      part_of_speech: String(form.part_of_speech || "other"),
      difficulty: Number(form.difficulty || 2),
    };
    if (!payload.word) return;
    if (editing?.id) {
      await vocabularyApi.adminUpdateWord(editing.id, payload);
    } else {
      await vocabularyApi.adminCreateWord(payload);
    }
    setEditing(null);
    setForm({ word: "", meaning: "", example: "", part_of_speech: "other", difficulty: 2 });
    await fetchWords();
  };

  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-lg font-extrabold text-foreground">Vocabulary admin</p>
        <p className="mt-2 text-sm text-muted-foreground">You don’t have access to manage content.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-ds-gold">Admin</p>
          <p className="mt-1 text-xl font-extrabold tracking-tight text-foreground">Vocabulary words</p>
          <p className="mt-1 text-sm text-muted-foreground">Add, edit, and curate the learning bank.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/vocabulary/daily"
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-surface-2"
          >
            Student view
          </Link>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm({ word: "", meaning: "", example: "", part_of_speech: "other", difficulty: 2 });
            }}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-surface-2"
          >
            New word
          </button>
          <button
            type="button"
            onClick={() => void fetchWords()}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-surface-2"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className={INPUT}
            />
            <p className="text-sm font-semibold text-muted-foreground">
              {loading ? "Loading…" : `${filtered.length} words`}
            </p>
          </div>

          <div className="mt-4 grid gap-2">
            {filtered.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  setEditing(w);
                  setForm(w);
                }}
                className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-surface-2"
              >
                <p className="text-base font-extrabold text-foreground">{w.word}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{w.meaning || "—"}</p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-label-foreground">
                  {w.part_of_speech} · Difficulty {w.difficulty}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-extrabold uppercase tracking-wider text-label-foreground">
            {editing ? `Edit #${editing.id}` : "Create"}
          </p>
          <div className="mt-3 grid gap-3">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-label-foreground">Word</p>
              <input className={INPUT} value={form.word || ""} onChange={(e) => setForm({ ...form, word: e.target.value })} />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-label-foreground">Meaning</p>
              <textarea
                className={`${INPUT} min-h-[90px]`}
                value={form.meaning || ""}
                onChange={(e) => setForm({ ...form, meaning: e.target.value })}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-label-foreground">Example</p>
              <textarea
                className={`${INPUT} min-h-[90px]`}
                value={form.example || ""}
                onChange={(e) => setForm({ ...form, example: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-label-foreground">Part of speech</p>
                <select
                  className={INPUT}
                  value={form.part_of_speech || "other"}
                  onChange={(e) => setForm({ ...form, part_of_speech: e.target.value })}
                >
                  {[
                    "noun",
                    "verb",
                    "adjective",
                    "adverb",
                    "pronoun",
                    "preposition",
                    "conjunction",
                    "interjection",
                    "other",
                  ].map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-label-foreground">Difficulty</p>
                <select
                  className={INPUT}
                  value={String(form.difficulty ?? 2)}
                  onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}
                >
                  <option value="1">1 (Easy)</option>
                  <option value="2">2 (Medium)</option>
                  <option value="3">3 (Hard)</option>
                </select>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void save()}
                className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-extrabold hover:bg-primary/15"
              >
                Save
              </button>
              {editing ? (
                <button
                  type="button"
                  onClick={async () => {
                    await vocabularyApi.adminDeleteWord(editing.id);
                    setEditing(null);
                    setForm({ word: "", meaning: "", example: "", part_of_speech: "other", difficulty: 2 });
                    await fetchWords();
                  }}
                  className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-extrabold hover:bg-surface-2"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Bulk upload is optional; for now you can also use Django admin at <span className="font-semibold">/django-admin/</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

