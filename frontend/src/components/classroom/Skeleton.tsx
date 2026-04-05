import { cn } from "@/lib/cn";

export function ClassroomSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-lg ds-skeleton", className)}
      aria-hidden
    />
  );
}

export function ClassroomClassListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="cr-surface rounded-2xl p-6 space-y-4">
          <div className="flex justify-between gap-4">
            <div className="flex-1 space-y-2">
              <ClassroomSkeleton className="h-5 w-[min(200px,75%)]" />
              <ClassroomSkeleton className="h-4 w-[min(160px,90%)]" />
            </div>
            <ClassroomSkeleton className="h-10 w-10 shrink-0 rounded-xl" />
          </div>
          <ClassroomSkeleton className="h-px w-full" />
          <ClassroomSkeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="cr-surface rounded-2xl border border-slate-200/60 p-6 dark:border-slate-700/60"
        >
          <div className="mb-4 flex items-center gap-3">
            <ClassroomSkeleton className="h-10 w-10 rounded-xl" />
            <ClassroomSkeleton className="h-3 w-24" />
          </div>
          <ClassroomSkeleton className="h-9 w-32 rounded-lg" />
          <ClassroomSkeleton className="mt-4 h-px w-full" />
          <ClassroomSkeleton className="mt-4 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function ClassroomDetailSkeleton() {
  return (
    <div className="space-y-6">
      <ClassroomSkeleton className="h-10 w-64 rounded-xl" />
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <ClassroomSkeleton key={i} className="h-10 w-28 rounded-xl" />
        ))}
      </div>
      <div className="cr-surface rounded-2xl p-10 flex justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    </div>
  );
}
