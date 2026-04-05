import { cn } from "@/lib/cn";

export function ClassroomSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-gradient-to-r from-slate-200/80 via-slate-100/90 to-slate-200/80 dark:from-slate-700/50 dark:via-slate-600/40 dark:to-slate-700/50 bg-[length:200%_100%]",
        className,
      )}
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
        <div className="h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    </div>
  );
}
