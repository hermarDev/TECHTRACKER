"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/shell/InlineError";
import { cn } from "cn";

export interface FloatingInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Field-level validation message; renders red border/label + helper text below. */
  error?: string | null;
  /** Extra classes for the floating label (e.g. `left-10` when a leading icon is present). */
  labelClassName?: string;
}

const LABEL_IDLE =
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-[var(--field-surface,var(--card))] px-1 text-base transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs";

export const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ label, id, className, error, labelClassName, ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            {...props}
            placeholder=" "
            aria-invalid={Boolean(error) || Boolean(props["aria-invalid"])}
            aria-describedby={
              error && id ? `${id}-error` : props["aria-describedby"]
            }
            className={cn(
              "peer h-12 rounded-md bg-[var(--field-surface,var(--card))] px-3.5 py-3 text-base",
              error ? "" : "border-border",
              className
            )}
          />
          <Label
            htmlFor={id}
            className={cn(
              LABEL_IDLE,
              error
                ? "text-destructive peer-focus:text-destructive"
                : "text-muted-foreground peer-focus:text-primary",
              labelClassName
            )}
          >
            {label}
          </Label>
        </div>
        {error && (
          <InlineError message={error} id={id ? `${id}-error` : undefined} />
        )}
      </div>
    );
  }
);
FloatingInput.displayName = "FloatingInput";
