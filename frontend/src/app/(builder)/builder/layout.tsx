"use client";

import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { canManageQuestionsConsole } from "@/lib/permissions";

const nav = [
  { href: "/practice-tests", label: "Pastpaper tests" },
  { href: "/mock-exam", label: "Timed mock" },
  { href: "/midterm", label: "Midterm" },
  { href: "/builder/sets", label: "Assessment builder" },
  { href: "/assessments/assign", label: "Assign assessments" },
];

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const allowed = canManageQuestionsConsole();

  return (
    <AuthGuard adminOnly>
      <div className="app-bg min-h-screen text-foreground">
        <div className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6">
          <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-ds-gold">Questions console</p>
            <p className="mt-1 text-xl font-extrabold tracking-tight">Tests + Builder</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pastpapers, mock tests, midterm, and assessment authoring. Backend permissions are authoritative.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
            <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              {!allowed ? (
                <p className="p-3 text-sm text-muted-foreground">You don’t have access to author assessments.</p>
              ) : (
                <nav className="flex flex-col gap-1">
                  {nav.map((n) => {
                    const active =
                      n.href === "/practice-tests"
                        ? pathname === "/practice-tests" || pathname.startsWith("/practice-test/")
                        : pathname === n.href || pathname.startsWith(n.href + "/");
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
              )}
            </aside>
            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

