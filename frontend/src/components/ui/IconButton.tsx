import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonVariant = "default" | "ghost" | "muted";

const variantClass: Record<IconButtonVariant, string> = {
  default:
    "ms-icon-btn border border-slate-200/90 bg-white/90 text-slate-700 shadow-sm hover:border-blue-300/80 hover:bg-gradient-to-br hover:from-white hover:to-amber-50/30 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:border-amber-500/35 dark:hover:from-white/[0.08] dark:hover:to-amber-500/10",
  ghost:
    "ms-icon-btn-ghost border border-transparent text-slate-600 hover:bg-slate-100/90 dark:text-slate-400 dark:hover:bg-white/[0.06]",
  muted:
    "ms-icon-btn-ghost border border-transparent text-slate-500 hover:bg-slate-100/80 dark:text-slate-500 dark:hover:bg-white/[0.05]",
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
        "inline-flex items-center justify-center",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/90 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:focus-visible:ring-amber-400/55 dark:focus-visible:ring-offset-black",
        "disabled:pointer-events-none disabled:opacity-40",
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
