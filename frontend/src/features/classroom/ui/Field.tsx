"use client";

import { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-xl border bg-[var(--background)] text-foreground placeholder:text-muted-foreground/70 " +
  "border-border transition-colors duration-150 focus:outline-none focus:border-primary " +
  "focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50 disabled:cursor-not-allowed " +
  "aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-500/30";

const sizing = "h-10 px-3 text-sm";

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/** Label + hint + error wrapper. Pass the control's id as htmlFor for a11y. */
export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold text-[var(--text-label)]">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-rose-500">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(control, sizing, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-[7rem] py-2.5 px-3 text-sm resize-y", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(control, sizing, "appearance-none pr-9", className)} {...rest}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      </div>
    );
  },
);

/** Convenience: labelled text input with a generated id. */
export function TextField({
  label,
  hint,
  error,
  required,
  ...input
}: Omit<FieldProps, "children"> & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      <Input id={id} aria-invalid={!!error} required={required} {...input} />
    </Field>
  );
}
