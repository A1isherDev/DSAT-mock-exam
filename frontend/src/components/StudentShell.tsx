"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  Bell,
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { ClassroomButton } from "@/components/classroom";
import { cn } from "@/lib/cn";

const SIDEBAR_COLLAPSED_KEY = "mastersat.sidebarCollapsed";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerSearch, setHeaderSearch] = useState("");
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const headerSearchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setIsLoggedIn(!!Cookies.get("access_token"));
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (headerSearchRef.current && !headerSearchRef.current.contains(t)) setHeaderSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(t)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((c) => {
      const n = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, n ? "1" : "0");
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const filteredNav = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return nav;
    return nav.filter((n) => n.label.toLowerCase().includes(q));
  }, [navQuery]);

  const title = pageTitle(pathname);

  const commandResults = useMemo(() => {
    const q = headerSearch.trim().toLowerCase();
    const fromNav = nav.map((n) => ({ href: n.href, label: n.label }));
    const fromQuick = quickLinks.map((q) => ({ href: q.href, label: q.label }));
    const merged = [...fromNav, ...fromQuick.filter((q) => !fromNav.some((n) => n.href === q.href))];
    if (!q) return merged.slice(0, 6);
    return merged.filter((x) => x.label.toLowerCase().includes(q)).slice(0, 8);
  }, [headerSearch]);

  const navLinkClass = (active: boolean) =>
    cn(
      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
      sidebarCollapsed && "md:justify-center md:px-2",
      active
        ? "bg-gradient-to-r from-blue-600/12 to-blue-500/8 text-blue-950 ring-1 ring-blue-200/90 dark:from-blue-600/25 dark:to-blue-500/15 dark:text-white dark:ring-blue-500/40"
        : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white",
    );

  return (
    <AuthGuard isOptional>
      <div className="app-bg flex min-h-screen flex-col text-slate-900 transition-colors duration-300 dark:text-slate-100 md:h-[100dvh] md:max-h-[100dvh] md:flex-row md:overflow-hidden">
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
            "fixed inset-y-0 left-0 z-[100] flex h-[100dvh] w-[min(100%,280px)] shrink-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white shadow-xl shadow-blue-500/5 backdrop-blur-xl transition-[transform,width,padding] duration-200 ease-out dark:border-slate-800 dark:bg-black md:relative md:z-30 md:h-full md:max-h-full md:min-h-0 md:translate-x-0 md:shadow-none",
            sidebarCollapsed ? "md:w-[4.25rem] md:px-0" : "md:w-72",
            mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <div
            className={cn(
              "flex items-center justify-between gap-2 border-b border-slate-100/90 p-4 dark:border-slate-800/80 md:p-5",
              sidebarCollapsed && "md:flex-col md:gap-3 md:py-4",
            )}
          >
            <div className={cn("flex min-w-0 items-center gap-3", sidebarCollapsed && "md:w-full md:justify-center")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
              <div className={cn("min-w-0", sidebarCollapsed && "md:hidden")}>
                <span className="block truncate text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                  MasterSAT
                </span>
                <span className="ds-section-title mt-0.5 block text-[10px] dark:text-slate-400">Learning OS</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <IconButton
                variant="ghost"
                size="sm"
                className="hidden md:flex"
                onClick={toggleSidebarCollapsed}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </IconButton>
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
          </div>

          <div className={cn("px-4 pt-4 md:px-5", sidebarCollapsed && "md:hidden")}>
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
                className="w-full rounded-xl border border-slate-200/90 bg-white/90 py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </div>
          </div>

          <div className={cn("px-4 pt-3 md:px-5", sidebarCollapsed && "md:hidden")}>
            <p className="ds-section-title py-2 text-[10px] dark:text-slate-500">Navigate</p>
          </div>
          <nav
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-4 md:px-4",
              sidebarCollapsed && "md:items-center md:px-2",
            )}
            aria-label="Main"
          >
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
                  <Tooltip key={href} content={tip} side="right">
                    <Link
                      href={href}
                      className={cn(navLinkClass(active), "w-full")}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                          active
                            ? "bg-blue-600/15 text-blue-800 dark:bg-blue-500/25 dark:text-white"
                            : "bg-slate-100/80 text-slate-500 group-hover:bg-white dark:bg-white/5 dark:text-slate-400 dark:group-hover:bg-white/10",
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                      </span>
                      <span className={cn("leading-snug", sidebarCollapsed && "md:sr-only")}>{label}</span>
                    </Link>
                  </Tooltip>
                );
              })
            )}
          </nav>

          <div className={cn("mt-auto border-t border-slate-100/90 p-4 dark:border-slate-800/80", sidebarCollapsed && "md:px-2")}>
            <div className={cn("flex flex-wrap gap-2", sidebarCollapsed && "md:justify-center")}>
              <Badge variant="brand" dot={isLoggedIn}>
                <span className={cn(sidebarCollapsed && "md:sr-only")}>{isLoggedIn ? "Signed in" : "Guest"}</span>
              </Badge>
            </div>
            <p className={cn("ds-caption mt-2 text-[11px]", sidebarCollapsed && "md:hidden")}>
              Tip: use the search box to filter long menus.
            </p>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:overflow-hidden">
          {/* Top bar (mobile + desktop) */}
          <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white px-2 backdrop-blur-xl dark:border-slate-800 dark:bg-black md:h-[72px] md:gap-3 md:px-6">
            <IconButton
              variant="ghost"
              className="md:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </IconButton>

            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div ref={headerSearchRef} className="relative hidden min-w-0 max-w-xl flex-1 md:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={headerSearch}
                  onChange={(e) => {
                    setHeaderSearch(e.target.value);
                    setHeaderSearchOpen(true);
                  }}
                  onFocus={() => setHeaderSearchOpen(true)}
                  placeholder="Search pages…"
                  className="w-full rounded-xl border border-slate-200/90 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-white/5 dark:text-white"
                  aria-label="Search pages and quick links"
                  aria-expanded={headerSearchOpen}
                  aria-controls="header-search-results"
                />
                {headerSearchOpen && commandResults.length > 0 ? (
                  <ul
                    id="header-search-results"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-72 overflow-auto rounded-xl border border-slate-200/90 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-black"
                    role="listbox"
                  >
                    {commandResults.map((r) => (
                      <li key={r.href + r.label} role="option">
                        <Link
                          href={r.href}
                          className="block px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/10"
                          onClick={() => {
                            setHeaderSearchOpen(false);
                            setHeaderSearch("");
                          }}
                        >
                          {r.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="min-w-0 max-w-[min(100%,200px)] flex-1 sm:max-w-xs md:max-w-[240px] lg:max-w-xs">
                <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50 md:text-lg">
                  {title}
                </p>
                <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block md:hidden lg:block">
                  MasterSAT
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <div className="hidden items-center gap-2 lg:flex">
                <span className="ds-section-title text-[9px] dark:text-slate-500">Quick</span>
                {quickLinks.map((q) => (
                  <Link
                    key={q.href}
                    href={q.href}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs font-bold text-blue-700 shadow-sm transition-all duration-200 hover:border-blue-300 hover:bg-blue-50 dark:border-white/15 dark:bg-white/5 dark:text-blue-300 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/15"
                  >
                    <Zap className="h-3 w-3 opacity-80" />
                    {q.label}
                  </Link>
                ))}
              </div>

              <div className="relative" ref={notifRef}>
                <Tooltip content="Notifications" side="bottom">
                  <IconButton
                    variant="ghost"
                    aria-label="Notifications"
                    aria-expanded={notifOpen}
                    onClick={() => setNotifOpen((o) => !o)}
                    className="relative"
                  >
                    <Bell className="h-5 w-5" />
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 opacity-50" aria-hidden />
                  </IconButton>
                </Tooltip>
                {notifOpen ? (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-slate-200/90 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-black">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Notifications
                    </p>
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">You&apos;re all caught up.</p>
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      Grades and assignments will appear here when available.
                    </p>
                  </div>
                ) : null}
              </div>

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
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-blue-900/20 transition-all hover:bg-blue-700 active:scale-[0.98] md:px-4 md:text-sm dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <LogIn className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign in</span>
                </button>
              )}
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-transparent px-2 pb-8 pt-2 md:px-4 md:pt-3 lg:px-6">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
