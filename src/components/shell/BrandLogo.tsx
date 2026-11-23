import * as React from "react";
import { cn } from "cn";

export function BrandLogo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="TechTracker"
      className={cn("size-9 shrink-0", className)}
      {...props}
    >
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <rect x="6" y="8" width="20" height="3.5" rx="1.5" fill="var(--primary-foreground)" />
      <rect x="10.5" y="11" width="3.5" height="13" rx="1.5" fill="var(--primary-foreground)" />
      <rect x="18" y="11" width="3.5" height="8" rx="1.5" fill="var(--primary-foreground)" />
      <circle cx="19.75" cy="22.25" r="1.85" fill="var(--primary-foreground)" />
    </svg>
  );
}
