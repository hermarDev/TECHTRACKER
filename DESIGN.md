---
name: TechTracker
description: Institutional duty and laboratory monitoring interface
colors:
  primary: "oklch(0.46 0.19 260)"
  primary-foreground: "oklch(0.99 0 0)"
  background: "oklch(0.985 0.004 247)"
  foreground: "oklch(0.175 0.025 256)"
  card: "oklch(1 0 0)"
  muted: "oklch(0.955 0.008 247)"
  muted-foreground: "oklch(0.44 0.02 256)"
  border: "oklch(0.89 0.012 250)"
  sidebar: "oklch(0.195 0.03 258)"
  destructive: "oklch(0.54 0.21 25)"
  success: "oklch(50.8% 0.118 165.612)"
  warning: "oklch(47.3% 0.137 46.201)"
typography:
  body:
    fontFamily: "Plus Jakarta Sans, sans-serif"
  data:
    fontFamily: "JetBrains Mono, monospace"
rounded:
  sm: "4px"
  md: "6.4px"
  pill: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.sm}"
---

# Design System: TechTracker

## Overview

Canon is a restrained institutional workspace: clear hierarchy, aligned data, and familiar controls support quick, accountable work. Cobalt accents and a slate navigation rail establish identity without decorative gradients or glass effects.

## Colors

Use the primary cobalt for the main action, links, and focus. The off-white canvas, white cards, slate text, and subtle borders establish hierarchy. Semantic emerald, amber, and red distinguish credited or functioning, pending or maintenance, and rejected or repair states. Pair every status color with a label and icon. The dark theme substitutes the corresponding tokens defined in `src/app/globals.css`.

## Typography

Plus Jakarta Sans is the interface face. Use JetBrains Mono and tabular numerals for IDs, hours, timestamps, and other values that benefit from alignment. Preserve a clear distinction between page titles, section titles, body text, and supporting labels.

## Layout

Desktop uses a persistent sidebar and spacious content area; mobile uses a bottom navigation bar with overflow in a drawer. Tables scroll horizontally when needed. Forms and review actions remain usable on narrow screens, with mobile controls at least 44 pixels high.

## Elevation & Depth

Use surface color and thin borders to separate regions. Shadows are restrained; do not introduce decorative blur or glass overlays.

## Shapes

Use the small radius from the shared token scale for cards, controls, and dialogs. Rounded status pills may distinguish compact states; avoid oversized rounded message containers.

## Components

Use the shared buttons, fields, dialogs, pagination, and `StatusBadge` components. Provide persistent labels, visible focus, descriptive errors, and loading and empty states. Destructive alerts use an assertive live region; static informational callouts use a polite status. Forms preserve drafts where appropriate and keep sensitive credentials out of local storage.

## Do's and Don'ts

- Keep pending and credited hours distinct, and use the product's established status vocabulary.
- Give each icon-only action an accessible name and each interactive element a visible focus state.
- Avoid decorative gradients, glassmorphism, and reliance on color alone.
- Keep dense operational screens scannable on both desktop and mobile.
