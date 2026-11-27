import { headers } from "next/headers";
import type { Role } from "@/lib/types";

let warnedMissingRustUrl = false;

export function getRustBackendUrl(): string {
  const configured = process.env.RUST_BACKEND_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production" && !warnedMissingRustUrl) {
    warnedMissingRustUrl = true;
    console.error("[techtracker-web] RUST_BACKEND_URL is unset in production; falling back to http://127.0.0.1:8080");
  }
  return "http://127.0.0.1:8080";
}

export async function getBackendSession(): Promise<{ role: Role } | null> {
  const cookie = (await headers()).get("cookie");
  const baseUrl = getRustBackendUrl();

  try {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { user?: { role?: string } };
    const role = body.user?.role;
    if (role !== "SUPERADMIN" && role !== "ADMIN" && role !== "STUDENT") return null;
    return { role };
  } catch (error) {
    console.error("[techtracker-web] Failed to reach Rust /api/auth/me:", error);
    return null;
  }
}
