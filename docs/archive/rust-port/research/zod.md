# Research: `zod` -> serde + garde/validator

Fit: **partial**. Decision: serde for (de)serialization, garde/validator for
validation; error messages may differ (ADR-010).

- Schemas become Rust structs with serde derives; validation rules become garde
  attributes or manual checks.
- Error messages will differ from zod's; record such cases as known-diffs with
  user approval.
- Semantic traps: optional vs nullable, default values, coercion, refinements,
  union/enum handling, error path formatting.
Sources: zod.dev, docs.rs/serde, docs.rs/garde.
