import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ClassroomButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ClassroomButtonSize = "sm" | "md";

export type ClassroomButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ClassroomButtonVariant;
  size?: ClassroomButtonSize;
  children: ReactNode;
};

const variantClass: Record<ClassroomButtonVariant, string> = {
  primary:
    "border border-transparent bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/15 hover:from-indigo-500 hover:to-indigo-600 dark:shadow-indigo-950/50",
  secondary:
    "border border-slate-200/90 bg-white/90 text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:bg-slate-800",
  ghost:
    "border border-transparent text-slate-600 hover:bg-slate-100/90 dark:text-slate-300 dark:hover:bg-slate-800/70",
  danger:
    "border border-red-200/90 bg-red-50 text-red-800 hover:bg-red-100/90 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-200 dark:hover:bg-red-950/55",
};

const sizeClass: Record<ClassroomButtonSize, string> = {
  sm: "min-h-9 px-3.5 py-2 text-xs gap-1.5 rounded-[10px]",
  md: "min-h-11 px-4 py-2.5 text-sm gap-2 rounded-xl",
};

export function ClassroomButton({
  variant = "primary",
  size = "md",
  className,
  disabled,
  type,
  children,
  ...rest
}: ClassroomButtonProps) {
  return (
    <button
      type={type ?? "button"}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-all duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:focus-visible:ring-offset-slate-950",
        "disabled:pointer-events-none disabled:opacity-45",
        "active:scale-[0.98]",
        sizeClass[size],
        variantClass[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
