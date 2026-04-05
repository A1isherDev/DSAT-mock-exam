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
        "cr-surface rounded-2xl transition-[transform,box-shadow,border-color] duration-200 ease-out",
        pad[padding],
        interactive &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-violet-200/80 hover:shadow-lg hover:shadow-violet-500/8 dark:hover:border-violet-500/30 dark:hover:shadow-violet-500/10",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
