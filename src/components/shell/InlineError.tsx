import { CircleAlert } from "lucide-react";

export interface InlineErrorProps {
  /** Field-level validation message rendered directly below the input. */
  message: string;
  id?: string;
}

/** Compact field-level error: red icon + text, sits below the input (Material helper error). */
export function InlineError({ message, id }: InlineErrorProps) {
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
