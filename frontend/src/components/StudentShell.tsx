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
      <div className="min-h-screen app-bg dark:bg-[#020617] transition-colors duration-300 flex text-slate-900 dark:text-slate-100">
        <aside className="w-72 shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl flex flex-col sticky top-0 h-screen transition-colors duration-300">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800/50 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="Master SAT" className="w-10 h-10 object-contain" />
            <div>
              <span className="block font-extrabold text-slate-900 dark:text-white tracking-tight">MasterSAT</span>
              <span className="text-[10px] font-black tracking-[0.16em] uppercase text-slate-400">Learning Platform</span>
            </div>
          </div>
          <div className="px-5 pt-5 pb-2">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Sections</p>
          </div>
          <nav className="flex-1 px-4 pb-5 space-y-1.5 overflow-y-auto">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    active
                      ? "bg-gradient-to-r from-blue-50 to-white dark:from-blue-500/10 dark:to-blue-500/5 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-500/20 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-white/80 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent"
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
          <header className="h-16 border-b border-slate-200/80 dark:border-slate-800 bg-white/75 dark:bg-slate-950/80 backdrop-blur-xl flex items-center justify-end px-8 gap-4 shrink-0 sticky top-0 z-40 transition-colors duration-300">
            {mounted && (
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200"
                aria-label="Toggle dark mode"
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            )}

            {isLoggedIn ? (
              <button
                type="button"
                onClick={() => authApi.logout()}
                className="btn-secondary text-xs uppercase tracking-wider"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="btn-primary text-xs uppercase tracking-wider"
              >
                <LogIn className="w-4 h-4" />
                Sign in
              </button>
            )}
          </header>
          <main className="flex-1 min-h-0 bg-transparent px-1">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
