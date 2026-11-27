import path from "path";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // Charter Line 42: 5MB max

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function getStorageRoot(): string {
  return path.resolve(process.cwd(), ".storage");
}

export function validateUploadFile(file: { size: number; type: string; name?: string }): {
  ok: true;
} | {
  ok: false;
  error: string;
} {
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      error: `Unsupported file type (${file.type || "unknown"}). Allowed: JPEG, PNG, WEBP, PDF.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: "File is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "File exceeds maximum allowed size of 5 MB." };
  }
  return { ok: true };
}

export function resolveSafeStoragePath(key: string): string {
  const clean = key.replace(/^\/+/, "");
  if (!clean || clean.includes("..") || path.isAbsolute(clean)) {
    throw new Error("Invalid storage key");
  }
  const root = getStorageRoot();
  const resolved = path.resolve(root, clean);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error("Storage path traversal rejected");
  }
  return resolved;
}

export function mimeFromStorageKey(key: string): string {
  const ext = path.extname(key).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";
  return "image/jpeg";
}
