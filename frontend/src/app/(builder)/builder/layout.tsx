"use client";

import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  LayoutDashboard,
  Library,
  LayoutGrid,
  Tag,
  SendHorizonal,
  Archive,
  FileText,
  BookMarked,
} from "lucide-react";

/**
 * Questions console navigation.
 *
 * Active-state rules:
 *   - Dashboard: exact match only
 *   - All others: prefix match (covers nested sub-pages)
 */
const NAV = [
  {
    href: "/builder",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/builder/bank",
    label: "Question Bank",
    icon: Library,
    exact: false,
  },
  {
    href: "/builder/sets",
    label: "Assessments",
    icon: LayoutGrid,
    exact: false,
  },
  {
    href: "/builder/categories",
    label: "Categories",
    icon: Tag,
    exact: false,
  },
  {
    href: "/builder/pastpapers",
    label: "Pastpapers",
    icon: FileText,
    exact: false,
  },
  {
    href: "/builder/vocabulary",
    label: "Vocabulary",
    icon: BookMarked,
    exact: false,
  },
  {
    href: "/builder/publish-queue",
    label: "Publish Queue",
    icon: SendHorizonal,
    exact: false,
  },
  {
    href: "/builder/archived",
    label: "Archived",
    icon: Archive,
    exact: false,
  },
] as const;

function isNavActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard adminOnly>
      <div className="app-bg min-h-screen text-foreground">
        <div className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            {/* Sidebar nav — sticky on large screens */}
            <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm lg:self-start lg:sticky lg:top-4">
              {/* Console identity — compact, no description paragraph */}
              <div className="mb-3 border-b border-border px-2 pb-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-ds-gold">
                  Questions console
                </p>
                <p className="mt-0.5 text-sm font-extrabold text-foreground">MasterSAT</p>
              </div>

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
            </aside>

            {/* Main content area */}
            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
