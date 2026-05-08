"use client";

import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  School,
  AlertOctagon,
  ScrollText,
} from "lucide-react";

/**
 * Operational console navigation.
 *
 * This layout serves admin.mastersat.uz — the operational side of the platform.
 * It is STRICTLY separated from the questions console (questions.mastersat.uz).
 *
 * Responsibility boundary:
 *   Operations console (this layout):
 *     - Assignments (create, monitor, close)
 *     - User management (roles, activation, suspension)
 *     - Classroom management
 *     - Scoring failure recovery
 *     - Audit logs
 *
 *   Questions console ((builder) layout):
 *     - Question authoring
 *     - Assessment set management
 *     - Content publishing
 */
const NAV = [
  {
    href: "/ops",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/ops/assignments",
    label: "Assignments",
    icon: ClipboardList,
    exact: false,
  },
  {
    href: "/ops/classrooms",
    label: "Classrooms",
    icon: School,
    exact: false,
  },
  {
    href: "/ops/users",
    label: "Users",
    icon: Users,
    exact: false,
  },
  {
    href: "/ops/scoring-issues",
    label: "Scoring issues",
    icon: AlertOctagon,
    exact: false,
  },
  {
    href: "/ops/audit",
    label: "Audit log",
    icon: ScrollText,
    exact: false,
  },
] as const;

function isNavActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard adminOnly>
      <div className="app-bg min-h-screen text-foreground">
        <div className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6">
          {/* Console identity header */}
          <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-ds-gold">
                Admin console
              </p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700">
                Operations
              </span>
            </div>
            <p className="mt-1 text-xl font-extrabold tracking-tight">Platform operations</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Assignments · classrooms · users · scoring · audit. Content authoring is in the{" "}
              <a
                href={
                  process.env.NEXT_PUBLIC_QUESTIONS_CONSOLE_URL ??
                  "https://questions.mastersat.uz/builder"
                }
                className="font-semibold text-primary hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Questions console →
              </a>
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            {/* Sidebar */}
            <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm lg:self-start lg:sticky lg:top-4">
              <nav className="flex flex-col gap-0.5">
                {NAV.map((item) => {
                  const active = isNavActive(pathname, item.href, item.exact);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-bold transition-colors",
                        active
                          ? "bg-surface-2 text-foreground"
                          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Legacy admin link — during transition period */}
              <div className="mt-3 border-t border-border pt-3">
                <Link
                  href="/admin"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
                >
                  ← Legacy admin panel
                </Link>
              </div>
            </aside>

            {/* Main content */}
            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
