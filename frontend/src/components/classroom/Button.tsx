import { cn } from "@/lib/cn";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ClassroomButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ClassroomButtonSize = "sm" | "md";

export type ClassroomButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ClassroomButtonVariant;
  size?: ClassroomButtonSize;
  children: ReactNode;
  /** Shows spinner and disables the control */
  loading?: boolean;
};

const variantClass: Record<ClassroomButtonVariant, string> = {
  primary:
    "border border-transparent bg-gradient-to-r from-violet-600 via-violet-500 to-cyan-600 text-white shadow-md shadow-violet-500/20 hover:brightness-110 dark:shadow-violet-950/40",
  secondary:
    "border border-slate-200/90 bg-white/90 text-slate-800 shadow-sm hover:border-violet-200/80 hover:bg-violet-50/40 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:border-violet-500/25 dark:hover:bg-slate-800",
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
  loading,
  type,
  children,
  ...rest
}: ClassroomButtonProps) {
  const isBusy = loading || disabled;
  return (
    <button
      type={type ?? "button"}
      disabled={!!isBusy}
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-all duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:focus-visible:ring-offset-slate-950",
        "disabled:pointer-events-none disabled:opacity-45",
        loading && "relative",
        "active:scale-[0.98]",
        sizeClass[size],
        variantClass[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span className={cn(size === "sm" ? "max-w-[10rem]" : "max-w-[14rem]", "truncate opacity-90")}>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
