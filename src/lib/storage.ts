import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // Charter Line 42: 5MB max

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

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

export async function saveUploadedObject(
  category: "attendance" | "tasks" | "inspections" | "messages",
  file: File
): Promise<{ key: string; name: string; mime: string; size: number }> {
  const check = validateUploadFile({ size: file.size, type: file.type, name: file.name });
  if (!check.ok) {
    throw new Error(check.error);
  }
  const ext = MIME_TO_EXT[file.type] ?? ".bin";
  const key = `${category}/${crypto.randomUUID()}${ext}`;
  const fullPath = resolveSafeStoragePath(key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buf);
  return {
    key,
    name: path.basename(file.name || `upload${ext}`).slice(0, 120),
    mime: file.type,
    size: file.size,
  };
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
