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
    "ms-btn-primary border border-transparent bg-gradient-to-r from-blue-600 via-blue-600 to-amber-600 text-white shadow-md shadow-blue-500/20 shadow-amber-900/15 dark:shadow-blue-950/35 dark:shadow-amber-950/25",
  secondary:
    "ms-btn-secondary border border-slate-200/90 bg-white/90 text-slate-800 shadow-sm hover:border-blue-300/70 hover:bg-gradient-to-br hover:from-white hover:to-amber-50/25 dark:border-white/10 dark:bg-neutral-950/90 dark:text-slate-100 dark:hover:border-amber-500/35 dark:hover:from-neutral-950 dark:hover:to-amber-950/15",
  ghost:
    "ms-btn-ghost border border-transparent text-slate-600 hover:bg-slate-100/90 dark:text-slate-300 dark:hover:bg-white/[0.06]",
  danger:
    "ms-btn-destructive border border-amber-600/45 bg-neutral-950 text-amber-50 shadow-sm hover:border-amber-400/70 hover:bg-black hover:text-white dark:border-amber-500/40 dark:bg-black dark:text-amber-100 dark:hover:border-amber-300/55 dark:hover:bg-neutral-950",
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
        "inline-flex items-center justify-center font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/90 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:focus-visible:ring-amber-400/60 dark:focus-visible:ring-offset-black",
        "disabled:pointer-events-none disabled:opacity-45",
        loading && "relative",
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
