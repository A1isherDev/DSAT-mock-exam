import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export type ClassroomCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Hover lift + stronger shadow (for clickable tiles). */
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
};

const pad: Record<NonNullable<ClassroomCardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function ClassroomCard({
  className,
  children,
  interactive,
  padding = "md",
  ...rest
}: ClassroomCardProps) {
  return (
    <div
      className={cn(
        "cr-surface rounded-2xl",
        pad[padding],
        interactive &&
          "cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-indigo-200/70 hover:shadow-lg hover:shadow-indigo-500/5 dark:hover:border-indigo-500/25",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
