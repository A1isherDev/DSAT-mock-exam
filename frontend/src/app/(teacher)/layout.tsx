"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { LayoutDashboard, ClipboardList, Users, Menu, X, Search } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/teacher", label: "Dashboard", icon: LayoutDashboard, tip: "Overview and shortcuts" },
  { href: "/teacher/homework", label: "Homework", icon: ClipboardList, tip: "Assignments across classes" },
  { href: "/teacher/students", label: "Students", icon: Users, tip: "Roster and progress" },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return nav;
    return nav.filter((n) => n.label.toLowerCase().includes(s));
  }, [q]);

  const title =
    nav.find((n) => (n.href === "/teacher" ? pathname === "/teacher" : pathname.startsWith(n.href)))?.label ??
    "Teacher";

  const linkCls = (active: boolean) =>
    cn(
      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
      active
        ? "bg-gradient-to-r from-blue-600/12 to-sky-500/10 text-blue-950 ring-1 ring-blue-200/90 dark:from-blue-500/18 dark:to-sky-500/10 dark:text-blue-100 dark:ring-blue-500/30"
        : "text-slate-600 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100",
    );

  return (
    <AuthGuard adminOnly>
      <div className="app-bg flex min-h-screen flex-col text-slate-900 dark:text-slate-100 md:flex-row">
        {mobileOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-[90] bg-slate-950/50 backdrop-blur-sm md:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-[100] flex h-[100dvh] w-[min(100%,272px)] shrink-0 flex-col border-r border-slate-200/80 bg-white/90 shadow-xl backdrop-blur-xl transition-transform duration-200 dark:border-slate-800 dark:bg-slate-950/90 md:static md:h-screen md:min-h-0 md:translate-x-0 md:shadow-none",
            mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800 md:p-6">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.png" alt="" className="h-10 w-10 object-contain" />
              <div>
                <p className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">Teacher</p>
                <Badge variant="brand" className="mt-1">
                  MasterSAT
                </Badge>
              </div>
            </div>
            <IconButton variant="ghost" size="sm" className="md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="px-4 pt-4 md:px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter…"
                className="w-full rounded-xl border border-slate-200/90 bg-white/90 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </div>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-4" aria-label="Teacher">
            {filtered.map(({ href, label, icon: Icon, tip }) => {
              const active = href === "/teacher" ? pathname === "/teacher" : pathname.startsWith(href);
              return (
                <Tooltip key={href} content={tip} side="right">
                  <Link
                    href={href}
                    className={cn(linkCls(active), "w-full")}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        active
                          ? "bg-blue-600/15 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200"
                          : "bg-slate-100/80 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    {label}
                  </Link>
                </Tooltip>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-[56px] items-center gap-3 border-b border-slate-200/80 bg-white/80 px-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/75 md:h-[64px] md:px-6">
            <IconButton variant="ghost" className="md:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </IconButton>
            <h1 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900 dark:text-slate-50 md:text-lg">{title}</h1>
          </header>
          <main className="flex-1 px-2 py-3 md:px-4 lg:px-6">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
