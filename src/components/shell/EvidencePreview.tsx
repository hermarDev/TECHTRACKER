/* Authenticated and local preview images bypass the Next image optimizer. */
/* eslint-disable @next/next/no-img-element */
"use client";

import * as React from "react";
import { AlertCircle, ExternalLink, FileText, ImageOff, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Shared evidence/attachment preview with explicit loading, error, missing,
 * PDF fallback, retry, and open-original states.
 */
export function EvidencePreview({
  fileKey,
  alt,
  emptyLabel = "No evidence file recorded.",
}: {
  fileKey?: string | null;
  alt: string;
  emptyLabel?: string;
}) {
  const cleanKey = fileKey?.trim() ?? "";
  if (!cleanKey) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
        <ImageOff className="size-5" aria-hidden="true" />
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return <EvidencePreviewContent key={cleanKey} cleanKey={cleanKey} alt={alt} />;
}

function EvidencePreviewContent({ cleanKey, alt }: { cleanKey: string; alt: string }) {
  const [retryCount, setRetryCount] = React.useState(0);
  const [status, setStatus] = React.useState<"loading" | "loaded" | "error">("loading");

  const baseUrl = cleanKey.startsWith("/api/files/") ? cleanKey : `/api/files/${cleanKey}`;
  const isPdf = /\.pdf($|\?)/i.test(cleanKey);

  if (isPdf) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 p-4 text-center">
        <FileText className="size-6 text-primary" aria-hidden="true" />
        <p className="text-sm font-medium">PDF document attachment</p>
        <a
          href={baseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Open original PDF
        </a>
      </div>
    );
  }

  const src = retryCount > 0 ? `${baseUrl}?retry=${retryCount}` : baseUrl;

  return (
    <div className="space-y-2">
      <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2">
        {status === "loading" && (
          <div
            aria-label="Loading evidence preview"
            className="absolute inset-0 animate-pulse bg-muted/60"
          />
        )}
        {status === "error" ? (
          <div className="flex flex-col items-center justify-center gap-2.5 p-4 text-center">
            <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
            <p className="text-sm font-medium">Preview unavailable</p>
            <p className="text-xs text-muted-foreground">
              The file could not be rendered as an image or is unavailable.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatus("loading");
                  setRetryCount((c) => c + 1);
                }}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Retry preview
              </Button>
              <a
                href={baseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Open original
              </a>
            </div>
          </div>
        ) : (
          <img
            src={src}
            alt={alt}
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
            className="max-h-[55vh] w-full rounded-lg object-contain"
          />
        )}
      </div>
      {status === "loaded" && (
        <div className="flex justify-end">
          <a
            href={baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden="true" />
            Open original
          </a>
        </div>
      )}
    </div>
  );
}
