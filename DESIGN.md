---
name: TechTracker
description: Institutional duty and laboratory monitoring interface
colors:
  primary: "#2563EB"
  primary-foreground: "#FFFFFF"
  background: "#FAFAFA"
  foreground: "#182235"
  card: "#FFFFFF"
  muted: "#F4F6F9"
  muted-foreground: "#526176"
  border: "#DCE2EA"
  sidebar: "#0F172A"
  destructive: "#B91C1C"
  success: "#166534"
  warning: "#92400E"
typography:
  body:
    fontFamily: "Plus Jakarta Sans, sans-serif"
  data:
    fontFamily: "JetBrains Mono, monospace"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
---

# Design System: TechTracker

## Overview

Canon is a restrained institutional workspace: clear hierarchy, aligned data, and familiar controls support quick, accountable work. Cobalt accents and a slate navigation rail establish identity without decorative gradients or glass effects.

## Colors

Use the primary cobalt for the main action, links, and focus. The off-white canvas, white cards, slate text, and subtle borders establish hierarchy. Semantic emerald, amber, and red distinguish credited or functioning, pending or maintenance, and rejected or repair states. Pair every status color with a label and icon. The dark theme substitutes the corresponding tokens defined in `src/app/globals.css`.

## Typography

Plus Jakarta Sans is the interface face. Use JetBrains Mono and tabular numerals for IDs, hours, timestamps, and other values that benefit from alignment. Preserve a clear distinction between page titles, section titles, body text, and supporting labels.

## Layout

Public and auth pages share `PublicHeader` (`BrandLogo`, `ThemeToggle`, single sign-in CTA) and centered V3 containers. Authenticated desktop views use a persistent grouped sidebar (`Workspace`, `Management`, `Governance`, `Communication`, `Account`), a compact topbar displaying the `{role} / {page}` breadcrumb with notification, theme, and account actions, and page `<h1>` titles + subtitles rendered inside `<main>`; mobile uses a bottom navigation bar with overflow in a drawer. Tables scroll horizontally when needed. Forms and review actions remain usable on narrow screens, with mobile controls at least 44 pixels high (`h-10` on desktop filter inputs/selects).

## Elevation & Depth

Use surface color, thin `#DCE2EA` / `#30343C` borders, and subtle `shadow-xs` to separate regions. Do not introduce decorative blur or glass overlays.

## Shapes

Use `12px` (`rounded-xl`) for cards, panels, dialogs, and popups; `8px` (`rounded-lg`) for buttons, inputs, triggers, and message containers; and `9999px` (`rounded-full`) for status pills and active indicators.

## Components

Use the shared buttons, fields, dialogs, pagination, `PublicHeader`, `EvidencePreview`, and `StatusBadge` components. `EvidencePreview` handles loading, missing-file, PDF fallback, retry, and open-original states consistently across attendance and task reviews. Report filters invalidate stale snapshots and disable exports until regenerated. Provide persistent labels, visible focus, descriptive errors, and loading and empty states. Destructive alerts use an assertive live region; static informational callouts use a polite status. Forms preserve drafts where appropriate and keep sensitive credentials out of local storage.

## Do's and Don'ts

- Keep pending and credited hours distinct, and use the product's established status vocabulary.
- Give each icon-only action an accessible name and each interactive element a visible focus state.
- Avoid decorative gradients, glassmorphism, and reliance on color alone.
- Keep dense operational screens scannable on both desktop and mobile.
