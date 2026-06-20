"use client";

/**
 * /pastpapers — Past papers library, rebuilt to match the MasterSAT Past Papers
 * mockup (shared `.dzboard` scope): SIMULATION header, Region + Year segmented
 * filters, search, and booklet-style cards with a pulsing region edge.
 *
 * Data: GET pastpaper packs (public). Per-user completion/score isn't exposed by
 * this endpoint, so cards render the "available / not started" variant honestly.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
// Public pastpaper packs live only on examsPublicApi; no feature wrapper exists.
// eslint-disable-next-line no-restricted-imports
import { examsPublicApi, type PastpaperPackPublic } from "@/lib/api";
import { BookOpen, Calculator, Calendar, Globe, Search, Play, AlertTriangle, FileText, RefreshCw } from "lucide-react";

function fmtDate(s: string | null): string {
  if (!s) return "Undated";
  try { return new Date(s).toLocaleDateString("en-US", { month: "long", year: "numeric" }); } catch { return s; }
}
function yearOf(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s); return Number.isNaN(d.getTime()) ? null : String(d.getFullYear());
}

type Region = "ALL" | "US" | "INTL";

export default function PastpapersPage() {
  const router = useRouter();
  const [packs, setPacks] = useState<PastpaperPackPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [region, setRegion] = useState<Region>("ALL");
  const [year, setYear] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true); setError(false);
    examsPublicApi.getPastpaperPacks()
      .then((d) => setPacks(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const p of packs) { const y = yearOf(p.practice_date); if (y) set.add(y); }
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [packs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return packs.filter((p) => {
      if (region === "US" && p.form_type !== "US") return false;
      if (region === "INTL" && p.form_type === "US") return false;
      if (year !== "ALL" && yearOf(p.practice_date) !== year) return false;
      if (q) {
        const blob = `${p.title || ""} ${p.label || ""} ${p.form_type || ""} ${fmtDate(p.practice_date)}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [packs, region, year, search]);

  return (
    <div className="dzboard" style={{ maxWidth: 1280, width: "100%", margin: "0 auto" }}>
      <div className="dz-content">
        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <div className="dz-headin" style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".18em", color: "var(--dz-faint)" }}>SIMULATION</div>
          <h1 className="dz-headin" style={{ margin: "8px 0 0", fontSize: 38, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-.03em", color: "var(--dz-ink)" }}>Past papers</h1>
        </div>

        {/* Filters */}
        <div className="dz-headin" style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 20, flexWrap: "wrap" }}>
          <Segmented
            label="REGION"
            value={region}
            onChange={(v) => setRegion(v as Region)}
            options={[{ v: "ALL", l: "All" }, { v: "US", l: "US" }, { v: "INTL", l: "International" }]}
          />
          {years.length > 0 ? (
            <Segmented
              label="YEAR"
              value={year}
              onChange={setYear}
              options={[{ v: "ALL", l: "All" }, ...years.map((y) => ({ v: y, l: y }))]}
            />
          ) : null}
        </div>

        {/* Search */}
        <div className="dz-headin" style={{ position: "relative", marginBottom: 24, maxWidth: 560 }}>
          <span style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: "var(--dz-faint)", display: "flex" }}><Search size={18} /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search past papers…"
            style={{ width: "100%", border: "1px solid var(--dz-border)", background: "var(--dz-panel)", borderRadius: 14, padding: "14px 16px 14px 48px", fontFamily: "inherit", fontSize: 15, color: "var(--dz-ink)", outline: "none" }}
          />
        </div>

        {/* Body */}
        {error ? (
          <PapersError onRetry={load} />
        ) : loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 18 }}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="dz-skel" style={{ height: 188, borderRadius: 18 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <PapersEmpty hasFilter={region !== "ALL" || year !== "ALL" || !!search.trim()} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 18 }}>
            {filtered.map((p) => <Booklet key={p.id} pack={p} onOpen={() => router.push(`/pastpapers/${p.id}`)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Segmented({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[];
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", color: "var(--dz-faint)" }}>{label}</span>
      <div style={{ display: "flex", gap: 5, background: "var(--dz-card)", borderRadius: 11, padding: 4 }}>
        {options.map((o) => {
          const active = o.v === value;
          return (
            <div
              key={o.v}
              role="button"
              tabIndex={0}
              onClick={() => onChange(o.v)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(o.v); } }}
              className="dz-seg"
              style={{
                padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: active ? "var(--dz-panel)" : "transparent",
                color: active ? "var(--dz-indigo)" : "var(--dz-mute)",
                boxShadow: active ? "0 2px 6px rgba(15,23,41,.08)" : "none",
              }}
            >
              {o.l}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Booklet({ pack, onOpen }: { pack: PastpaperPackPublic; onOpen: () => void }) {
  const isUS = pack.form_type === "US";
  const regionMain = isUS ? "var(--dz-indigo)" : "#0d9488";
  const regionSoft = isUS ? "var(--dz-indigo-soft)" : "rgba(13,148,136,.12)";
  const rw = pack.sections.find((s) => s.subject === "READING_WRITING" || s.subject?.toLowerCase().includes("reading"));
  const math = pack.sections.find((s) => s.subject === "MATH" || s.subject?.toLowerCase().includes("math"));

  return (
    <div className="dz-booklet" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{ display: "flex", border: "1px solid var(--dz-border)", borderRadius: 18, overflow: "hidden", background: "var(--dz-panel)", cursor: "pointer" }}>
      <div className="dz-edge" style={{ width: 11, background: regionMain, flex: "none" }} />
      <div style={{ width: 10, background: "repeating-linear-gradient(var(--dz-panel), var(--dz-panel) 3px, var(--dz-border) 3px, var(--dz-border) 6px)", borderRight: "1px solid var(--dz-border)", flex: "none" }} />
      <div style={{ padding: "18px 20px", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "var(--dz-mute)", background: "var(--dz-card)", padding: "4px 10px", borderRadius: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: regionMain }} /> Not started
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: regionMain, background: regionSoft, padding: "4px 10px", borderRadius: 8 }}>
            <Globe size={13} /> {isUS ? "US" : "International"}
          </span>
        </div>
        <div className="clip1" style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.01em", color: "var(--dz-ink)" }}>
          {pack.title || `SAT past paper — ${fmtDate(pack.practice_date)}`}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--dz-mute)", marginTop: 6 }}>
          <Calendar size={14} /> {fmtDate(pack.practice_date)}
          {pack.label ? <><span style={{ color: "var(--dz-faint)" }}>·</span> Form {pack.label}</> : null}
        </div>
        <div style={{ height: 1, background: "var(--dz-border)", margin: "15px 0" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {rw ? <Chip icon={<BookOpen size={13} />} label="R&W" color="var(--dz-indigo)" soft="var(--dz-indigo-soft)" /> : null}
          {math ? <Chip icon={<Calculator size={13} />} label="Math" color="#0d9488" soft="rgba(13,148,136,.12)" /> : null}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className="dz-actionbtn"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 11, border: "none", background: "var(--dz-indigo)", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            <Play size={15} /> Start
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, label, color, soft }: { icon: React.ReactNode; label: string; color: string; soft: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color, background: soft, padding: "6px 11px", borderRadius: 9 }}>
      {icon} {label}
    </span>
  );
}

function PapersEmpty({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div style={{ border: "1.5px dashed var(--dz-border)", borderRadius: 22, padding: "64px 40px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", background: "var(--dz-card)" }}>
      <div style={{ width: 88, height: 88, borderRadius: 26, background: "var(--dz-indigo-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dz-indigo)", marginBottom: 22 }}>
        <FileText size={40} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.01em", color: "var(--dz-ink)" }}>{hasFilter ? "No matching papers" : "No past papers yet"}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--dz-mute)", marginTop: 8, maxWidth: 420, lineHeight: 1.5 }}>
        {hasFilter ? "Try a different region, year, or search." : "Released SAT papers will appear here once added."}
      </div>
    </div>
  );
}

function PapersError({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ border: "1.5px solid var(--dz-error-border)", borderRadius: 22, padding: "64px 40px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", background: "var(--dz-error-bg)" }}>
      <div style={{ width: 88, height: 88, borderRadius: 26, background: "var(--dz-error-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dz-error)", marginBottom: 22 }}>
        <AlertTriangle size={40} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.01em", color: "var(--dz-ink)" }}>Couldn&apos;t load past papers</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--dz-mute)", marginTop: 8, maxWidth: 440, lineHeight: 1.5 }}>
        Something went wrong on our end. Check your connection and try again.
      </div>
      <button type="button" onClick={onRetry} className="dz-joinbtn2"
        style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 26, padding: "13px 22px", borderRadius: 13, border: "none", background: "var(--dz-indigo)", fontFamily: "inherit", fontSize: 15, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
        <RefreshCw size={18} /> Try again
      </button>
    </div>
  );
}
