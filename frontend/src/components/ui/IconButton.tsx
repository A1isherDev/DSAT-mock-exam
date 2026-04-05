import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonVariant = "default" | "ghost" | "muted";

const variantClass: Record<IconButtonVariant, string> = {
  default:
    "border border-slate-200/90 bg-white/90 text-slate-700 shadow-sm hover:border-violet-200 hover:bg-violet-50/50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-violet-500/30 dark:hover:bg-violet-500/10",
  ghost:
    "border border-transparent text-slate-600 hover:bg-slate-100/90 dark:text-slate-400 dark:hover:bg-slate-800/80",
  muted:
    "border border-transparent text-slate-500 hover:bg-slate-100/80 dark:text-slate-500 dark:hover:bg-slate-800/60",
};

export function IconButton({
  children,
  className,
  variant = "default",
  size = "md",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: IconButtonVariant;
  size?: "sm" | "md";
}) {
  const sizeCls = size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl";
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center transition-all duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:focus-visible:ring-offset-slate-950",
        "disabled:pointer-events-none disabled:opacity-40",
        "active:scale-[0.96]",
        sizeCls,
        variantClass[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
