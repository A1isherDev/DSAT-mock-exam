"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { authApi } from "@/lib/api";
import {
  LayoutDashboard,
  BookOpenCheck,
  ClipboardList,
  FileWarning,
  Users,
  UserCircle,
  LogOut,
  LogIn,
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/practice-tests", label: "Practice Tests", icon: BookOpenCheck },
  { href: "/mock-exam", label: "Mock Exam", icon: ClipboardList },
  { href: "/midterm", label: "Midterm (no Desmos / Reference)", icon: FileWarning },
  { href: "/classes", label: "Classes", icon: Users },
  { href: "/profile", label: "Profil", icon: UserCircle },
];

export default function StudentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!Cookies.get("access_token"));
  }, [pathname]);

  return (
    <AuthGuard isOptional>
      <div className="min-h-screen bg-slate-50 flex">
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col sticky top-0 h-screen">
          <div className="p-5 border-b border-slate-100 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="Master SAT" className="w-9 h-9 object-contain" />
            <span className="font-extrabold text-slate-900 tracking-tight">MasterSAT</span>
          </div>
          <div className="px-4 pt-5 pb-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bo&apos;limlar</p>
          </div>
          <nav className="flex-1 px-3 pb-4 space-y-0.5 overflow-y-auto">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-800 border border-blue-100"
                      : "text-slate-600 hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 opacity-80" />
                  <span className="leading-snug">{label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-end px-6 gap-3 shrink-0 sticky top-0 z-40">
            {isLoggedIn ? (
              <button
                type="button"
                onClick={() => authApi.logout()}
                className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-red-600 transition-colors uppercase tracking-wider px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                <LogOut className="w-4 h-4" />
                Chiqish
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all uppercase tracking-wider px-4 py-2 rounded-lg shadow-md"
              >
                <LogIn className="w-4 h-4" />
                Kirish
              </button>
            )}
          </header>
          <main className="flex-1 min-h-0">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
