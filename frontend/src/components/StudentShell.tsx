"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/practice-tests", label: "Practice Tests", icon: BookOpenCheck },
  { href: "/mock-exam", label: "Mock Exam", icon: ClipboardList },
  { href: "/midterm", label: "Midterm (no Desmos / Reference)", icon: FileWarning },
  { href: "/classes", label: "Classes", icon: Users },
  { href: "/profile", label: "Profile", icon: UserCircle },
];

export default function StudentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsLoggedIn(!!Cookies.get("access_token"));
  }, [pathname]);

  return (
    <AuthGuard isOptional>
      <div className="min-h-screen bg-slate-50 dark:bg-[#020617] transition-colors duration-300 flex text-slate-900 dark:text-slate-100">
        <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md flex flex-col sticky top-0 h-screen transition-colors duration-300">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800/50 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="Master SAT" className="w-9 h-9 object-contain" />
            <span className="font-extrabold text-slate-900 dark:text-white tracking-tight">MasterSAT</span>
          </div>
          <div className="px-4 pt-5 pb-2">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Sections</p>
          </div>
          <nav className="flex-1 px-3 pb-4 space-y-1 overflow-y-auto">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    active
                      ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "opacity-100 text-blue-600 dark:text-blue-400" : "opacity-70"}`} />
                  <span className="leading-snug">{label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-end px-6 gap-4 shrink-0 sticky top-0 z-40 transition-colors duration-300">
            {mounted && (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                aria-label="Toggle dark mode"
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            )}

            {isLoggedIn ? (
              <button
                type="button"
                onClick={() => authApi.logout()}
                className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors uppercase tracking-wider px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-all uppercase tracking-wider px-4 py-2 rounded-lg shadow-md"
              >
                <LogIn className="w-4 h-4" />
                Sign in
              </button>
            )}
          </header>
          <main className="flex-1 min-h-0 bg-transparent">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
