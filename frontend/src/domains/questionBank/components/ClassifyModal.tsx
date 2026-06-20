"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { useQbDomains, useQbSkills } from "../hooks";
import type { QbClassifyInput } from "../types";

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

export function ClassifyModal({
  open,
  subject,
  title,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  subject?: string;
  title?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: QbClassifyInput) => void;
}) {
  const [domain, setDomain] = useState<number | "">("");
  const [skill, setSkill] = useState<number | "">("");
  const [difficulty, setDifficulty] = useState<string>("");

  const { data: domains } = useQbDomains(subject);
  const { data: skills } = useQbSkills(domain ? { domain: Number(domain) } : undefined);

  // Reset when reopened.
  useEffect(() => {
    if (open) {
      setDomain("");
      setSkill("");
      setDifficulty("");
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = domain !== "" && skill !== "" && difficulty !== "" && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">{title ?? "Classify question"}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <Labeled label="Domain">
            <select
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value ? Number(e.target.value) : "");
                setSkill("");
              }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">Select domain…</option>
              {(domains ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Labeled>

          <Labeled label="Skill">
            <select
              value={skill}
              disabled={!domain}
              onChange={(e) => setSkill(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="">{domain ? "Select skill…" : "Pick a domain first"}</option>
              {(skills ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Labeled>

          <Labeled label="Difficulty">
            <div className="flex gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={
                    difficulty === d
                      ? "flex-1 rounded-xl border border-primary bg-primary/10 px-3 py-2 text-sm font-bold text-primary"
                      : "flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-surface-2"
                  }
                >
                  {d.charAt(0) + d.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </Labeled>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit({ domain: Number(domain), skill: Number(skill), difficulty })}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : "Classify"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
