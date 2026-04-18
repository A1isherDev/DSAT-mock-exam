"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

const INPUT = "input-modern";

export type SearchableOption<T> = {
  value: T;
  primary: string;
  secondary?: string;
  keywords?: string;
};

type Props<T> = {
  options: SearchableOption<T>[];
  value: T | null;
  onChange: (next: T | null) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyHint?: string;
};

export function SearchableSelect<T>({
  options,
  value,
  onChange,
  placeholder = "Search…",
  disabled,
  emptyHint = "No matches",
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(() => options.find((o) => o.value === value) || null, [options, value]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => {
      const blob = `${o.primary} ${o.secondary || ""} ${o.keywords || ""}`.toLowerCase();
      return blob.includes(s);
    });
  }, [options, q]);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm ${
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-indigo-200"
        }`}
      >
        <span className="flex-1 min-w-0">
          {selected ? (
            <>
              <span className="font-semibold text-slate-900 block truncate">{selected.primary}</span>
              {selected.secondary ? (
                <span className="text-xs text-slate-500 block truncate">{selected.secondary}</span>
              ) : null}
            </>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && !disabled ? (
        <button
          type="button"
          className="fixed inset-0 z-[100] cursor-default bg-slate-900/10"
          aria-label="Close"
          onClick={() => setOpen(false)}
        />
      ) : null}
      {open && !disabled ? (
        <div className="absolute z-[110] mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50/80">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                className={INPUT + " !pl-8 !py-2 !text-xs"}
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter by title, id, subject…"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500 text-center">{emptyHint}</p>
            ) : (
              filtered.map((o, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQ("");
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50/80 border-b border-slate-50 last:border-0"
                >
                  <span className="font-semibold text-slate-900 block truncate">{o.primary}</span>
                  {o.secondary ? <span className="text-xs text-slate-500 block truncate">{o.secondary}</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
