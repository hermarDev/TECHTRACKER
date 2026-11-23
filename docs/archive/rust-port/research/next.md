# Research: `next` (Next.js)

Fit for Rust port of this web app's route handlers/API: **unknown/partial**.

- Next.js route handlers (`export async function GET(request: Request)`) rely on
  `NextRequest`/`NextResponse` and the Next.js runtime (cookies, headers, RSC).
  They cannot be imported directly into Node ESM without the Next runtime
  (recording fails with ERR_MODULE_NOT_FOUND for `next/server`).
- For a pure-Rust app, the equivalent is an Axum/Tower HTTP server with
  `axum::extract` and `axum::response::IntoResponse`, as already used in
  `backend/`.
- UI units (pages, components) stay in the source language per ADR-002; their
  `next` dependency is not ported.
- Semantic traps: response key order (serde `preserve_order`), status codes,
  cookie flags (httpOnly/sameSite/secure/maxAge), `NODE_ENV`-gated dev outbox.
Sources: nextjs.org docs (Route Handlers), docs.rs/axum.
