/**
 * Groups practice tests into cards (mock packs, pastpaper packs, legacy pairs, singles).
 * Mirrors the student /practice-tests list so homework and portal stay consistent.
 */

export type CardPack = { kind: "pack"; mockKey: number; mock: any; tests: any[] };
export type CardPastpaperPack = { kind: "pastpaper_pack"; packKey: string; pack: any; tests: any[] };
export type CardSingle = { kind: "single"; test: any };
export type PracticeCard = CardPack | CardPastpaperPack | CardSingle;

function normalizePastpaperLabel(label: string | null | undefined) {
  return (label || "").trim();
}

/** Legacy rows without pastpaper_pack: group by date + form + label. */
function standaloneGroupKey(t: any): string {
  return [t.practice_date || "", t.form_type || "", normalizePastpaperLabel(t.label)].join("|");
}

export function sortPastpaperSections(tests: any[]) {
  return [...tests].sort((a, b) => {
    const order = (s: string) => (s === "READING_WRITING" ? 0 : s === "MATH" ? 1 : 2);
    const d = order(a.subject) - order(b.subject);
    if (d !== 0) return d;
    return (a.id || 0) - (b.id || 0);
  });
}

export function buildCards(tests: any[]): PracticeCard[] {
  const byMock = new Map<number, any[]>();
  const byPastpaperPack = new Map<number, { pack: any; tests: any[] }>();
  const looseStandalone: any[] = [];

  for (const t of tests) {
    const m = t.mock_exam;
    if (m?.id) {
      if (!byMock.has(m.id)) byMock.set(m.id, []);
      byMock.get(m.id)!.push(t);
      continue;
    }
    const rawPack = t.pastpaper_pack;
    const pid =
      rawPack && typeof rawPack === "object" && rawPack.id != null
        ? Number(rawPack.id)
        : t.pastpaper_pack_id != null
          ? Number(t.pastpaper_pack_id)
          : null;
    if (pid != null && !Number.isNaN(pid)) {
      if (!byPastpaperPack.has(pid)) {
        const packObj =
          rawPack && typeof rawPack === "object"
            ? rawPack
            : {
                id: pid,
                title: "",
                practice_date: t.practice_date,
                label: t.label,
                form_type: t.form_type,
              };
        byPastpaperPack.set(pid, { pack: packObj, tests: [] });
      }
      byPastpaperPack.get(pid)!.tests.push(t);
      continue;
    }
    looseStandalone.push(t);
  }

  const packs: CardPack[] = Array.from(byMock.entries()).map(([mockKey, list]) => ({
    kind: "pack",
    mockKey,
    mock: list[0].mock_exam,
    tests: list,
  }));

  const dbPastpaperPacks: CardPastpaperPack[] = Array.from(byPastpaperPack.entries()).map(([id, { pack, tests }]) => ({
    kind: "pastpaper_pack",
    packKey: `db-${id}`,
    pack,
    tests: sortPastpaperSections(tests),
  }));

  const byLoose = new Map<string, any[]>();
  for (const t of looseStandalone) {
    const k = standaloneGroupKey(t);
    if (!byLoose.has(k)) byLoose.set(k, []);
    byLoose.get(k)!.push(t);
  }

  const legacyPacks: CardPastpaperPack[] = [];
  const singles: CardSingle[] = [];
  for (const [groupKey, list] of byLoose) {
    const unique = [...new Map(list.map((x) => [x.id, x])).values()];
    if (unique.length >= 2) {
      const p0 = unique[0];
      legacyPacks.push({
        kind: "pastpaper_pack",
        packKey: `legacy-${groupKey}`,
        pack: {
          id: null,
          title: "",
          practice_date: p0.practice_date,
          label: p0.label,
          form_type: p0.form_type,
        },
        tests: sortPastpaperSections(unique),
      });
    } else if (unique.length === 1) {
      singles.push({ kind: "single", test: unique[0] });
    }
  }

  const all: PracticeCard[] = [...packs, ...dbPastpaperPacks, ...legacyPacks, ...singles];
  const sortKey = (c: PracticeCard) => {
    if (c.kind === "pack") return c.mock.practice_date || "";
    if (c.kind === "pastpaper_pack") return c.pack?.practice_date || c.tests[0]?.practice_date || "";
    return c.test.practice_date || c.test.created_at || "";
  };
  all.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  return all;
}

export function formatLineDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function subjectLabel(subject: string) {
  if (subject === "MATH") return "Mathematics";
  return "Reading & Writing";
}

export function singleDisplayTitle(test: any) {
  if (test.title && String(test.title).trim()) return String(test.title).trim();
  const form = test.form_type === "US" ? "US Form" : "International Form";
  const letter = test.label ? ` ${test.label}` : "";
  return `${form}${letter} · ${subjectLabel(test.subject)}`.trim();
}

export function sharedPastpaperPackTitle(tests: any[]): string {
  if (tests.length === 0) return "Practice test";
  if (tests.length === 1) return singleDisplayTitle(tests[0]);
  const titles = tests.map((t) => (t.title || "").trim()).filter(Boolean);
  if (titles.length === 0) {
    const t = tests[0];
    const form = t.form_type === "US" ? "US Form" : "International Form";
    const letter = normalizePastpaperLabel(t.label) ? ` ${normalizePastpaperLabel(t.label)}` : "";
    return `${form}${letter}`.trim();
  }
  const stripSubjectTail = (s: string) =>
    s.replace(/\s*[—–-]\s*(Reading\s*&\s*Writing|R\s*&\s*W|English|Math|Mathematics)\s*$/i, "").trim();
  const bases = [...new Set(titles.map(stripSubjectTail))].filter(Boolean);
  if (bases.length === 1) return bases[0];
  return stripSubjectTail(titles[0]) || titles[0];
}

/** Pastpaper / standalone homework picker: no timed mock “pack” rows. */
export function buildHomeworkPastpaperCards(tests: any[]): (CardPastpaperPack | CardSingle)[] {
  return buildCards(tests).filter((c): c is CardPastpaperPack | CardSingle => c.kind !== "pack");
}
