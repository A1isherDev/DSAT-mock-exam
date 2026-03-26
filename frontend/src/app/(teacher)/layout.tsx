"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { LayoutDashboard, ClipboardList, Users } from "lucide-react";

const nav = [
  { href: "/teacher", label: "Dashboard", icon: LayoutDashboard },
  { href: "/teacher/homework", label: "Homework", icon: ClipboardList },
  { href: "/teacher/students", label: "Students", icon: Users },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AuthGuard adminOnly>
      <div className="min-h-screen app-bg flex">
        <aside className="w-72 shrink-0 border-r border-slate-200/80 bg-white/80 backdrop-blur-xl flex flex-col sticky top-0 h-screen">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="Master SAT" className="w-10 h-10 object-contain" />
            <div>
              <p className="font-extrabold text-slate-900 tracking-tight leading-tight">Teacher Panel</p>
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.18em]">MasterSAT</p>
            </div>
          </div>
          <nav className="flex-1 px-4 py-5 space-y-1.5 overflow-y-auto">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = href === "/teacher" ? pathname === "/teacher" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all ${
                    active
                      ? "bg-gradient-to-r from-blue-50 to-white text-blue-800 border border-blue-100 shadow-sm"
                      : "text-slate-600 hover:bg-white border border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 opacity-80" />
                  <span className="leading-snug">{label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 px-1">{children}</main>
      </div>
    </AuthGuard>
  );
}

