"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Search, X } from "lucide-react";

import { assessmentsAdminApi, type BankPickerRow } from "@/features/assessmentsAdmin/api";
import { useDebounce } from "@/hooks/useDebounce";

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

/**
 * M4 — pick an APPROVED Question Bank question and add it to the current set.
 * APPROVED-only is enforced server-side; the row is frozen on add (content +
 * images copied, bank link recorded). `subject` is the bank subject (MATH/ENGLISH).
 */
export function QuestionBankPickerModal({
  open,
  subject,
  onClose,
  onAdd,
  busy,
}: {
  open: boolean;
  subject: string;
  onClose: () => void;
  onAdd: (bankQuestionId: number) => void;
  busy?: boolean;
}) {
  const [searchRaw, setSearchRaw] = useState("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [domainId, setDomainId] = useState<number | "">("");
  const [skillId, setSkillId] = useState<number | "">("");
  const [selected, setSelected] = useState<BankPickerRow | null>(null);
  const search = useDebounce(searchRaw, 300);

  const taxonomy = useQuery({
    queryKey: ["qbPickerTaxonomy", subject],
    queryFn: () => assessmentsAdminApi.qbTaxonomy(subject),
    enabled: open,
    staleTime: 60_000,
  });

  const select = useQuery({
    queryKey: ["qbPickerSelect", subject, difficulty, domainId, skillId, search],
    queryFn: () =>
      assessmentsAdminApi.qbSelect({
        subject,
        difficulty: difficulty || undefined,
        domain_id: domainId ? Number(domainId) : undefined,
        skill_id: skillId ? Number(skillId) : undefined,
        search: search || undefined,
        limit: 50,
      }),
    enabled: open,
  });

  const skills = useMemo(
    () => (taxonomy.data?.skills ?? []).filter((s) => !domainId || s.domain === Number(domainId)),
    [taxonomy.data, domainId],
  );
  const rows = select.data?.results ?? [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Database className="h-5 w-5 text-primary" /> Add from Question Bank
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Search QB-ID or text…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <select
            value={domainId}
            onChange={(e) => {
              setDomainId(e.target.value ? Number(e.target.value) : "");
              setSkillId("");
            }}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-foreground outline-none focus:border-primary"
          >
            <option value="">All domains</option>
            {(taxonomy.data?.domains ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={skillId}
            disabled={!domainId}
            onChange={(e) => setSkillId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-foreground outline-none focus:border-primary disabled:opacity-50"
          >
            <option value="">All skills</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-foreground outline-none focus:border-primary"
          >
            <option value="">Any difficulty</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0) + d.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {select.isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : select.error ? (
            <p className="py-10 text-center text-sm text-rose-600">Failed to load bank questions.</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No approved questions match these filters.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(q)}
                    className={
                      selected?.id === q.id
                        ? "w-full rounded-xl border border-primary bg-primary/10 p-3 text-left"
                        : "w-full rounded-xl border border-border bg-background p-3 text-left hover:bg-surface-2"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-primary">{q.qb_id}</span>
                      <span className="text-xs text-muted-foreground">
                        {q.domain ?? "—"}
                        {q.skill ? ` › ${q.skill}` : ""} · {q.difficulty || "—"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-foreground">{q.question_text}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border p-4">
          <span className="text-xs text-muted-foreground">
            {selected ? `Selected ${selected.qb_id}` : "Select a question to add"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected || busy}
              onClick={() => selected && onAdd(selected.id)}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add to set"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
