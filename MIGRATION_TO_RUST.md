# TechTracker Rust Backend Cutover

## Status

- `backend/` (Axum + sqlx + Postgres) is the sole API, authentication, and persistence runtime.
- Next.js is a frontend-only shell with standalone output. `src/app/api/**` has been removed; `/api/:path*` rewrites to `RUST_BACKEND_URL`.
- Rust health check: `GET /api/health`.
- Next.js pages have no Prisma, database, or JWT-secret runtime imports. Prisma schema and seed files remain for schema and local data setup.

Set `RUST_BACKEND_URL` before building the standalone frontend so the API rewrite points at the Rust service.

## Local development

```bash
cd backend
cargo run
```

```bash
npm run dev
```

## Standalone deployment

Build with `RUST_BACKEND_URL` configured. Package `.next/standalone` with `public/` and `.next/static/`, then run `node server.js` from the standalone directory. Deploy the Rust service separately and route `/api/*` to it.
