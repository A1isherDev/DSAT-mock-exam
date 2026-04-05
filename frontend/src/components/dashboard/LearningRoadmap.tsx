"use client";

import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/cn";
import { DashboardCard, DashboardEyebrow } from "./DashboardCard";

export type RoadmapStep = {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
};

export function LearningRoadmap({ steps }: { steps: RoadmapStep[] }) {
  return (
    <DashboardCard accent="neutral" padding="md" className="md:col-span-2 lg:col-span-3">
      <DashboardEyebrow className="mb-1">Your path</DashboardEyebrow>
      <h2 className="mb-6 text-lg font-bold tracking-tight text-slate-900 dark:text-white">Learning roadmap</h2>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Link
              href={s.href}
              className={cn(
                "group flex h-full flex-col rounded-xl border p-4 transition-all duration-200",
                "border-slate-200/90 bg-slate-50/50 hover:border-slate-300 hover:bg-white",
                "dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-fuchsia-500/30 dark:hover:bg-white/[0.05]",
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200/80 text-xs font-black text-slate-600 dark:bg-white/10 dark:text-cyan-300">
                  {i + 1}
                </span>
                {s.done ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    Done
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <Circle className="h-3.5 w-3.5" />
                    Next
                  </span>
                )}
              </div>
              <p className="font-semibold text-slate-900 dark:text-white">{s.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{s.description}</p>
              <span className="mt-3 text-[11px] font-bold text-fuchsia-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-cyan-400">
                Open →
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </DashboardCard>
  );
}
