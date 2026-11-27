import { headers } from "next/headers";
import type { Role } from "@/lib/types";

export function getRustBackendUrl(): string {
  const configured = process.env.RUST_BACKEND_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("RUST_BACKEND_URL is required in production");
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
