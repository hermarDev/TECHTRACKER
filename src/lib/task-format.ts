export type RawAttachmentEntry =
  | string
  | { key?: unknown; name?: unknown; mime?: unknown; size?: unknown };

export type NormalizedAttachment = {
  key: string;
  name: string;
  isImage: boolean;
};

/**
 * Normalize submission attachment entries stored either as legacy string keys
 * or seeded `{ key, name, mime, size }` JSON objects.
 */
export function normalizeTaskAttachments(raw: unknown): NormalizedAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedAttachment[] = [];
  for (const item of raw) {
    let key = "";
    let name = "";
    let mime = "";
    if (typeof item === "string") {
      key = item.trim();
    } else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if (typeof rec.key === "string") key = rec.key.trim();
      if (typeof rec.name === "string" && rec.name.trim()) name = rec.name.trim();
      if (typeof rec.mime === "string") mime = rec.mime.trim();
    }
    if (!key) continue;
    if (!name) name = key.split("/").pop() || "Attachment";
    const isImage =
      mime.startsWith("image/") ||
      /\.(jpg|jpeg|png|webp|gif)$/i.test(key) ||
      /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
    out.push({ key, name, isImage });
  }
  return out;
}

/** Format a date string safely without returning "Invalid Date". */
export function formatSafeDate(value: string | null | undefined, fallback = "Not set"): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toLocaleDateString();
}

/** Format a timestamp string safely without returning "Invalid Date". */
export function formatSafeDateTime(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toLocaleString();
}
