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
  primary: "ms-btn-primary ms-cta-fill border-transparent",
  secondary:
    "ms-btn-secondary border border-border bg-card text-foreground shadow-sm hover:border-primary/35 hover:bg-surface-2",
  ghost:
    "ms-btn-ghost border border-transparent text-muted-foreground hover:bg-surface-2",
  danger:
    "ms-btn-destructive border border-amber-600/45 bg-surface-2 text-amber-100 shadow-sm hover:border-amber-400/70 hover:bg-background",
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/90 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
