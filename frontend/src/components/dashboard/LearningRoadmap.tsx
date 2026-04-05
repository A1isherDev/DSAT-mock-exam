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
    <DashboardCard accent="gold" padding="md" className="md:col-span-2 lg:col-span-3">
      <DashboardEyebrow className="mb-1">Your path</DashboardEyebrow>
      <h2 className="mb-6 text-lg font-bold tracking-tight text-foreground">Learning roadmap</h2>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Link
              href={s.href}
              className={cn(
                "group flex h-full flex-col rounded-xl border border-border bg-surface-2/50 p-4 transition-[transform,box-shadow,border-color,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "hover:border-primary/25 hover:bg-card",
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-card text-xs font-black text-foreground ring-1 ring-border">
                  {i + 1}
                </span>
                {s.done ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    <Check className="h-3.5 w-3.5" />
                    Done
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-label-foreground">
                    <Circle className="h-3.5 w-3.5" />
                    Next
                  </span>
                )}
              </div>
              <p className="font-semibold text-foreground">{s.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.description}</p>
              <span className="mt-3 text-[11px] font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Open →
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </DashboardCard>
  );
}
