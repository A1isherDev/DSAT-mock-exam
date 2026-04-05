"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { authApi } from "@/lib/api";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  BookOpenCheck,
  ClipboardList,
  FileWarning,
  Users,
  UserCircle,
  LogOut,
  LogIn,
  Sun,
  Moon,
  Menu,
  X,
  Search,
  Zap,
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { ClassroomButton } from "@/components/classroom";
import { cn } from "@/lib/cn";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, tip: "Your goals and latest mock" },
  { href: "/practice-tests", label: "Pastpaper tests", icon: BookOpenCheck, tip: "Untimed practice from your library" },
  { href: "/mock-exam", label: "Timed mock", icon: ClipboardList, tip: "Full-length timed diagnostics" },
  { href: "/midterm", label: "Midterm", icon: FileWarning, tip: "No Desmos / reference sheet" },
  { href: "/classes", label: "Classes", icon: Users, tip: "Groups, homework, grades" },
  { href: "/profile", label: "Profile", icon: UserCircle, tip: "Account and exam preferences" },
];

const quickLinks = [
  { href: "/practice-tests", label: "Practice" },
  { href: "/mock-exam", label: "Mock" },
  { href: "/classes", label: "Classes" },
];

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  const item = nav.find((n) =>
    n.href === "/"
      ? false
      : n.href === "/practice-tests"
        ? pathname === "/practice-tests" || pathname.startsWith("/practice-test/")
        : pathname.startsWith(n.href),
  );
  return item?.label ?? "MasterSAT";
}

export default function StudentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");

  useEffect(() => {
    setMounted(true);
    setIsLoggedIn(!!Cookies.get("access_token"));
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const filteredNav = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return nav;
    return nav.filter((n) => n.label.toLowerCase().includes(q));
  }, [navQuery]);

  const title = pageTitle(pathname);

  const navLinkClass = (active: boolean) =>
    cn(
      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
      active
        ? "bg-gradient-to-r from-violet-600/12 to-cyan-600/8 text-violet-900 ring-1 ring-violet-200/80 dark:from-violet-500/15 dark:to-cyan-500/8 dark:text-violet-100 dark:ring-violet-500/25"
        : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100",
    );

  return (
    <AuthGuard isOptional>
      <div className="min-h-screen app-bg flex flex-col text-slate-900 transition-colors duration-300 dark:text-slate-100 md:flex-row">
        {/* Mobile drawer overlay */}
        {mobileOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-[90] bg-slate-950/50 backdrop-blur-sm md:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-[100] flex w-[min(100%,280px)] flex-col border-r border-slate-200/80 bg-white/85 shadow-xl shadow-violet-500/5 backdrop-blur-xl transition-transform duration-200 ease-out dark:border-slate-800 dark:bg-slate-950/90 dark:shadow-black/40 md:static md:z-auto md:h-screen md:w-72 md:translate-x-0 md:shadow-none",
            mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100/90 p-4 dark:border-slate-800/80 md:p-6">
            <div className="flex min-w-0 items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
              <div className="min-w-0">
                <span className="block truncate text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                  MasterSAT
                </span>
                <span className="ds-section-title mt-0.5 block text-[10px]">Learning OS</span>
              </div>
            </div>
            <IconButton
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="px-4 pt-4 md:px-5">
            <label className="sr-only" htmlFor="nav-search">
              Filter navigation
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="nav-search"
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder="Jump to section…"
                className="w-full rounded-xl border border-slate-200/90 bg-white/90 py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="px-4 pt-3 md:px-5">
            <p className="ds-section-title py-2 text-[10px]">Navigate</p>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6 md:px-4" aria-label="Main">
            {filteredNav.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">No sections match “{navQuery}”.</p>
            ) : (
              filteredNav.map(({ href, label, icon: Icon, tip }) => {
                const active =
                  href === "/"
                    ? pathname === "/"
                    : href === "/practice-tests"
                      ? pathname === "/practice-tests" || pathname.startsWith("/practice-test/")
                      : pathname.startsWith(href);
                return (
                  <Tooltip key={href} content={tip} side="right" className="block w-full">
                    <Link
                      href={href}
                      className={cn(navLinkClass(active), "w-full")}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                          active
                            ? "bg-violet-600/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200"
                            : "bg-slate-100/80 text-slate-500 group-hover:bg-white dark:bg-slate-800/80 dark:text-slate-400 dark:group-hover:bg-slate-800",
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                      </span>
                      <span className="leading-snug">{label}</span>
                    </Link>
                  </Tooltip>
                );
              })
            )}
          </nav>

          <div className="mt-auto border-t border-slate-100/90 p-4 dark:border-slate-800/80">
            <div className="flex flex-wrap gap-2">
              <Badge variant="brand" dot={isLoggedIn}>
                {isLoggedIn ? "Signed in" : "Guest"}
              </Badge>
            </div>
            <p className="ds-caption mt-2 text-[11px]">Tip: use the search box to filter long menus.</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col md:min-h-screen">
          {/* Top bar (mobile + desktop) */}
          <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/80 px-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/75 md:h-[72px] md:px-6">
            <IconButton
              variant="ghost"
              className="md:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </IconButton>

            <div className="min-w-0 flex-1 md:flex md:items-center md:gap-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50 md:text-lg">
                  {title}
                </p>
                <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
                  MasterSAT · SAT prep workspace
                </p>
              </div>

              <div className="ml-auto hidden items-center gap-2 md:flex">
                <span className="ds-section-title mr-1 text-[9px]">Quick</span>
                {quickLinks.map((q) => (
                  <Link
                    key={q.href}
                    href={q.href}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/80 px-2.5 py-1.5 text-xs font-bold text-violet-700 shadow-sm transition-all hover:border-violet-200 hover:bg-violet-50/80 dark:border-slate-600 dark:bg-slate-900/50 dark:text-violet-300 dark:hover:border-violet-500/30 dark:hover:bg-violet-500/10"
                  >
                    <Zap className="h-3 w-3 opacity-80" />
                    {q.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {mounted && (
                <Tooltip content={theme === "dark" ? "Light mode" : "Dark mode"} side="bottom">
                  <IconButton
                    variant="default"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    aria-label="Toggle dark mode"
                  >
                    {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </IconButton>
                </Tooltip>
              )}

              {isLoggedIn ? (
                <ClassroomButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => authApi.logout()}
                  className="!px-2.5 sm:!px-3"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Sign out</span>
                </ClassroomButton>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-violet-500/20 transition-all hover:brightness-110 active:scale-[0.98] md:px-4 md:text-sm"
                >
                  <LogIn className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign in</span>
                </button>
              )}
            </div>
          </header>

          <main className="min-h-0 flex-1 bg-transparent px-2 pb-8 pt-2 md:px-4 md:pt-3 lg:px-6">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
