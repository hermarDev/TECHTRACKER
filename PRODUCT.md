# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated + Charter-specified: Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui, Prisma ORM, PostgreSQL 16 (local Docker), local R2-compatible signed object storage, local SMTP outbox viewer (zero paid subscriptions).

## Users

- **Incoming Fourth-Year BSIT Students (ACLC College of Mandaue):** Self-register, submit photo-assisted Time In / Time Out attendance (no GPS), track pending vs. approved credited hours toward the 100-hour Pre-OJT requirement, start/document/resubmit assigned technical tasks, perform assigned computer laboratory unit inspections, and message Pre-OJT coordinators.
- **Admin (Pre-OJT Coordinator / Technical Staff):** Verify student accounts, build/schedule batches, review and correct attendance with audit justification, accept or return task completion reports with mandatory student-visible remarks and private internal staff notes, inspect lab rooms/units, message students individually or by batch, import student directories (CSV/XLSX), and export CSV/PDF operational reports.
- **SuperAdmin (System Owner):** Executive oversight across all batches, 100-hour completion rules, Admin account CRUD, flagged attendance photo review, escalation rulings, full audit trail search/export, lab/unit master configuration, and system alerts (strictly no chat access).

## Product Purpose

Streamline and verify the 100-hour technical Pre-OJT monitoring and computer laboratory equipment condition inspection workflows for incoming fourth-year BSIT students at ACLC College of Mandaue, replacing manual paper logbooks and ad-hoc tracking with auditable, role-scoped digital workflows.

## Positioning

A centralized two-module institutional monitoring system pairing verified 100-hour technical Pre-OJT duty accounting (separating pending logged hours from coordinator-accredited hours) with structured room-by-unit computer laboratory condition audits, strictly bounded by college policy without GPS tracking, automated grading, or SIS coupling.

## Operating Context

Used on campus workstations, laptops, and mobile browsers (Chrome/Android web) in ACLC College of Mandaue computer laboratories and coordinator offices under active internet connectivity.

## Capabilities and Constraints

- **Web Flows Covered:** Pages `01W–16W` paired with Shared Backend Flows `02S–10S` from the approved TechTracker Draw.io workbooks.
- **Mandatory Charter Delimitations:**
  - Attendance photos are supporting evidence only — NO geolocation, GPS, geofence, facial recognition, or liveness detection.
  - Lab equipment inspection records condition (`Functioning`, `Needs Maintenance`, `Needs Repair`), mandatory defect remarks, and photo proof — NO urgent repair alert dispatch, repair work-orders, or technician ticketing.
  - SuperAdmin receives system alerts and escalated cases — NO chat access.
  - Task report reviews enforce mandatory student-visible return remarks and keep internal staff notes hidden from students.
  - All administrative tables enforce server-side pagination (`15 / 25 / 50`), search/filters, A–Z reference list sorting, and newest-first operational queue sorting.
  - Forms preserve in-progress entries in client storage (`localStorage`) and warn on unsaved navigation.
  - Authentication enforces `bcrypt` hashing, 5-attempt / 15-minute lockout with security alert email logging, and `<= 5MB` MIME-validated uploads.
- **Prototype Local Simulation (inferred from "no subscription" constraint):** PostgreSQL 16 runs via local Docker (`127.0.0.1:5444`); Cloudflare R2 object storage is modeled via authenticated local filesystem object storage; transactional SMTP emails render into a local dev outbox table/page (`/dev/outbox`).

## Brand Commitments

- **Name:** TechTracker (ACLC College of Mandaue — BSIT Pre-OJT & Lab Equipment Monitoring).
- **UI Library & Styling:** shadcn/ui components styled with Tailwind CSS.
- **Tone:** Clear institutional precision, unambiguous status vocabulary (`Pending Review`, `Approved / Credited`, `Irregular / Off-Schedule`, `Returned for Revision`, `Accepted`, `Functioning`, `Needs Maintenance`, `Needs Repair`).

## Evidence on Hand

- Project Charter: `/home/hrmr/Documents/CAPSTONE_TEACHTRACKER/TechTracker_Project_Charter_Justified.docx`
- Master Flowcharts: `/home/hrmr/Documents/CAPSTONE_TEACHTRACKER/FLOWCHARTS/output/TechTracker_Web_Master_Flowcharts.drawio` (`01W–16W`) and `TechTracker_Shared_Backend_Flowcharts.drawio` (`02S–10S`).
- No pre-existing application code in `Tech_Tracker/` (greenfield prototype).

## Product Principles

1. **Verifiable Hours Over Raw Punches:** Always distinguish unverified pending punches from coordinator-accredited hours toward the 100-hour target.
2. **Strict Role & Policy Boundaries:** Enforce least-privilege visibility (`04S`) and Charter delimitations at both API and UI layers.
3. **Auditability & Zero Silent Loss:** Preserve drafts locally, require confirmation receipts, and record immutable audit entries for corrections, reviews, and rulings.
4. **Checklist Efficiency on Desktop & Mobile:** Make 40-unit lab audits, batch attendance queues, and task revisions fast and scannable on both `1440px` desktop and `430px` mobile screens.

## Accessibility & Inclusion

WCAG 2.1 AA contrast (>=4.5:1 body, >=3:1 large text/UI), minimum 44px touch targets on mobile controls, keyboard-accessible dialogs and tables, and screen-reader-safe status/error alerts (`role="alert"` + semantic non-color indicators).
