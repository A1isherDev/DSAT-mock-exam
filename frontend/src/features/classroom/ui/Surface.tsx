import { cn } from "@/lib/cn";

type Padding = "none" | "sm" | "md" | "lg";

const padding: Record<Padding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  pad?: Padding;
  interactive?: boolean;
  as?: React.ElementType;
}

/** Surface container. Whitespace over borders; one hairline, soft radius. */
export function Card({ pad = "md", interactive, as: As = "div", className, ...rest }: CardProps) {
  return (
    <As
      className={cn(
        "rounded-2xl border border-border bg-card",
        interactive && "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[var(--ds-shadow-md)]",
        padding[pad],
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Hairline divider that prefers whitespace — use sparingly. */
export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}
