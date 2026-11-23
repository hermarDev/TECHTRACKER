# Research: `@prisma/client` -> sqlx

Fit: **partial** (per analyze). Decision: sqlx raw SQL against the existing schema
(ADR-009); Prisma remains schema/migration owner.

- Prisma's dynamic query builder (findMany with orderBy/take/where) must be
  rewritten as parameterized SQL. Watch for: `orderBy: { createdAt: "desc" }`,
  `take`/`skip` pagination, `select`, relation includes.
- Types: Prisma generates TS types; Rust structs derive serde + sqlx::FromRow.
- Migrations: keep `prisma db push` / `prisma migrate`; Rust reads the same DB.
- Semantic traps: null handling (Option<T>), JSON columns (serde_json::Value),
  DateTime (chrono), UUID (uuid crate), pagination defaults (15/25/50).
Sources: prisma.io docs, docs.rs/sqlx, docs.rs/chrono.
