"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/shell/InlineError";
import { cn } from "cn";

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  inputClassName?: string;
  label?: string;
  /** Field-level validation message; renders red border/label + helper text below. */
  error?: string | null;
}

const LABEL_IDLE =
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-[var(--field-surface,var(--card))] px-1 text-base transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs";

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, inputClassName, label, error, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="w-full">
        <div className={cn("relative flex items-center", className)}>
          <Input
            ref={ref}
            type={visible ? "text" : "password"}
            {...props}
            placeholder=" "
            aria-invalid={Boolean(error) || Boolean(props["aria-invalid"])}
            aria-describedby={
              error && props.id ? `${props.id}-error` : props["aria-describedby"]
            }
            className={cn(
              "peer h-12 rounded-lg bg-[var(--field-surface,var(--card))] px-3.5 py-3 pr-11 text-base",
              error ? "" : "border-input/70",
              inputClassName
            )}
          />
          {label && (
            <label
              htmlFor={props.id}
              className={cn(
                LABEL_IDLE,
                error
                  ? "text-destructive peer-focus:text-destructive"
                  : "text-muted-foreground peer-focus:text-primary"
              )}
            >
              {label}
            </label>
          )}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="absolute right-0 top-0 flex h-12 w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {error && (
          <InlineError
            message={error}
            id={props.id ? `${props.id}-error` : undefined}
          />
        )}
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
