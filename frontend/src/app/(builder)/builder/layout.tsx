"use client";

import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/builder/sets", label: "Assessment sets" },
  { href: "/builder/sets/new", label: "New set" },
];

// § 4.5 — detect console from hostname; prefer runtime signal over cookie
// Cookie is a useful fallback but can be stale or absent in dev.
function useConsoleLabel(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith("questions.")) return "Questions console";
  if (host.startsWith("admin.")) return "Admin console";
  // localhost / unknown: no pill
  return null;
}

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const consoleLabel = useConsoleLabel();

  return (
    <AuthGuard adminOnly>
      <div className="app-bg min-h-screen text-foreground">
        <div className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6">
          <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-ds-gold">Questions console</p>
              {/* § 4.5 — subdomain identity pill: amber on questions, slate on admin */}
              {consoleLabel ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                  {consoleLabel}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xl font-extrabold tracking-tight">Assessment builder</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create and edit assessment sets and questions. Backend permissions are authoritative.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
            <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <nav className="flex flex-col gap-1">
                {nav.map((n) => {
                  // § 4.1 — tightened active check: "New set" is only active when exactly on
                  // /builder/sets/new; "Assessment sets" stays active on all nested set routes.
                  const active =
                    pathname === n.href ||
                    (n.href !== "/builder/sets/new" && pathname.startsWith(n.href + "/"));
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm font-bold transition-colors",
                        active ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                      )}
                    >
                      {n.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>
            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

