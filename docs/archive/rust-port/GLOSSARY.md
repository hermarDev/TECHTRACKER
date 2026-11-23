# TechTracker — Glossary (domain terms → Rust names)

Grows as units are ported. Each entry: term, meaning, Rust name (type/module/function).

- **Pending hours**: student-submitted attendance hours awaiting coordinator accreditation. Rust: `PendingHours` (f64), module `hours`.
- **Credited hours**: coordinator-accredited hours toward the 100-hour requirement. Rust: `CreditedHours`.
- **Pre-OJT**: pre-internship 100-hour technical duty. Rust: `PreOjt`.
- **Batch**: a scheduled cohort of students with a duty window. Rust: `Batch`.
- **Task**: assigned technical work item with start/submit/review lifecycle. Rust: `Task`, states `TaskStatus`.
- **Inspection**: room/unit condition audit (Functioning / Needs Maintenance / Needs Repair). Rust: `Inspection`, `UnitCondition`.
- **Escalation**: attendance/task issue raised to SuperAdmin. Rust: `Escalation`.
- **Accreditation PDF**: "100-Hour Internal Duty Accreditation Summary Log" export. Rust: `accreditation_pdf`.
- **Session cookie**: `SESSION_COOKIE_NAME` auth cookie. Rust: `SESSION_COOKIE_NAME`.
- **Outbox**: local dev email viewer (replaces SMTP). Rust: `EmailOutbox`.
- **Unit (lab)**: a computer workstation in a lab room. Rust: `LabUnit`.
- **Room**: a computer laboratory room. Rust: `LabRoom`.
