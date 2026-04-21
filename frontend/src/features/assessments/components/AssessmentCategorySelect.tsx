"use client";

import { useMemo } from "react";
import type { AssessmentSubjectKey } from "@/lib/assessmentSatTaxonomy";
import {
  allAssessmentCategoryValues,
  assessmentCategoryGroups,
  formatAssessmentCategoryValue,
} from "@/lib/assessmentSatTaxonomy";

type Props = {
  subject: AssessmentSubjectKey;
  value: string;
  onChange: (next: string) => void;
  className: string;
  disabled?: boolean;
  id?: string;
};

export function AssessmentCategorySelect({ subject, value, onChange, className, disabled, id }: Props) {
  const groups = useMemo(() => assessmentCategoryGroups(subject), [subject]);
  const knownFlat = useMemo(() => allAssessmentCategoryValues(subject), [subject]);
  const trimmed = value.trim();
  const legacy = Boolean(trimmed && !knownFlat.includes(trimmed));

  return (
    <select id={id} className={className} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— None —</option>
      {legacy ? (
        <optgroup label="Saved value (not in standard list)">
          <option value={value}>{value}</option>
        </optgroup>
      ) : null}
      {groups.map((g) => (
        <optgroup key={g.domain} label={g.domain}>
          {g.subdomains.map((s) => {
            const stored = formatAssessmentCategoryValue(g.domain, s);
            return (
              <option key={stored} value={stored}>
                {s}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
}
