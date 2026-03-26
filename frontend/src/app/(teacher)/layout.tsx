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
      <div className="min-h-screen bg-slate-50 flex">
        <aside className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col sticky top-0 h-screen">
          <div className="p-5 border-b border-slate-100 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="Master SAT" className="w-9 h-9 object-contain" />
            <div>
              <p className="font-extrabold text-slate-900 tracking-tight leading-tight">Teacher Panel</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MasterSAT</p>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = href === "/teacher" ? pathname === "/teacher" : pathname.startsWith(href);
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

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </AuthGuard>
  );
}

