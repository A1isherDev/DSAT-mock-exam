"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Database, ListChecks, Upload, Search, RefreshCw, Plus } from "lucide-react";

import { useQbQuestions } from "@/domains/questionBank/hooks";
import { QbStatusBadge } from "@/domains/questionBank/components/QbStatusBadge";
import { difficultyLabel } from "@/domains/questionBank/utils";
import type { QbQuestionFilters } from "@/domains/questionBank/types";
import { useDebounce } from "@/hooks/useDebounce";

const PAGE_SIZE = 50;

const STATUS_OPTIONS = ["IMPORTED", "TRIAGE", "APPROVED", "REJECTED", "ARCHIVED"] as const;
const SUBJECT_OPTIONS = ["ENGLISH", "MATH"] as const;
const DIFFICULTY_OPTIONS = ["EASY", "MEDIUM", "HARD"] as const;

export default function QuestionBankListPage() {
  const [subject, setSubject] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [searchRaw, setSearchRaw] = useState("");
  const [offset, setOffset] = useState(0);
  const search = useDebounce(searchRaw, 300);

  const filters: QbQuestionFilters = useMemo(
    () => ({
      subject: subject || undefined,
      status: status || undefined,
      difficulty: difficulty || undefined,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [subject, status, difficulty, search, offset],
  );

  const { data, isLoading, error, refetch, isFetching } = useQbQuestions(filters);
  const rows = data?.results ?? [];
  const count = data?.count ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  function resetAndSet(setter: (v: string) => void) {
    return (v: string) => {
      setter(v);
      setOffset(0);
    };
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <Database className="h-5 w-5 text-primary" />
            Question Bank
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The single source of truth for SAT questions. Only Approved questions are selectable by
            consumers and counted in analytics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/builder/question-bank/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            New question
          </Link>
          <Link
            href="/builder/question-bank/triage"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-surface-2"
          >
            <ListChecks className="h-3.5 w-3.5" />
            Triage Queue
          </Link>
          <Link
            href="/builder/question-bank/imports"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-surface-2"
          >
            <Upload className="h-3.5 w-3.5" />
            Imports
          </Link>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <RefreshCw className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchRaw}
            onChange={(e) => {
              setSearchRaw(e.target.value);
              setOffset(0);
            }}
            placeholder="Search QB-ID or question text…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <FilterSelect value={subject} onChange={resetAndSet(setSubject)} label="All subjects" options={SUBJECT_OPTIONS} />
        <FilterSelect value={status} onChange={resetAndSet(setStatus)} label="All statuses" options={STATUS_OPTIONS} />
        <FilterSelect value={difficulty} onChange={resetAndSet(setDifficulty)} label="Any difficulty" options={DIFFICULTY_OPTIONS} />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-bold">QB-ID</th>
              <th className="px-4 py-3 font-bold">Question</th>
              <th className="px-4 py-3 font-bold">Subject</th>
              <th className="px-4 py-3 font-bold">Domain / Skill</th>
              <th className="px-4 py-3 font-bold">Difficulty</th>
              <th className="px-4 py-3 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-rose-600">
                  Failed to load questions.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No questions match these filters.
                </td>
              </tr>
            ) : (
              rows.map((q) => (
                <tr key={q.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <Link href={`/builder/question-bank/${q.id}`} className="font-mono text-xs font-bold text-primary hover:underline">
                      {q.qb_id}
                    </Link>
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <Link href={`/builder/question-bank/${q.id}`} className="line-clamp-2 text-foreground hover:underline">
                      {q.question_text || <span className="text-muted-foreground">(no text)</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{q.subject}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {q.domain_name ? (
                      <span>
                        {q.domain_name}
                        {q.skill_name ? <span className="text-muted-foreground/70"> › {q.skill_name}</span> : null}
                      </span>
                    ) : (
                      <span className="italic text-muted-foreground/60">Unclassified</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{difficultyLabel(q.difficulty)}</td>
                  <td className="px-4 py-3">
                    <QbStatusBadge status={q.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {count} question{count === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="rounded-lg border border-border bg-card px-3 py-1.5 font-bold text-foreground disabled:opacity-40"
          >
            Previous
          </button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 font-bold text-foreground disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: readonly string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-foreground outline-none focus:border-primary"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o.charAt(0) + o.slice(1).toLowerCase()}
        </option>
      ))}
    </select>
  );
}
