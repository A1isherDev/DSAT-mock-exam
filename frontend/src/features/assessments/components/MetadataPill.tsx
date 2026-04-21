"use client";

export function MetadataPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-muted-foreground">
      <span className="uppercase tracking-wider text-label-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}

