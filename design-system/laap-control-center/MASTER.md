# LAAP Control Center · Master design system

Generated from the UI UX Pro Max design-system and targeted searches for `gaming operations dark dashboard glassmorphism`.

## Direction

- Product: secure game-account operations control plane.
- Pattern: real-time operations dashboard with live status, metrics, and an auditable activity trail.
- Style: glassmorphism in a dark-only surface system. Frosted layers use 10–20px blur, translucent white highlights, quiet borders, and z-depth.
- Density: dashboard-dense, but mobile-first. Use the 4/8px rhythm for gutters, rows, and section spacing.
- Typography: Fira Sans for interface copy, Fira Code for identifiers, timestamps, and metrics.
- Motion: subtle 180–240ms transitions. Respect `prefers-reduced-motion`; do not hide operational content behind animation.

## Semantic tokens

| Token | Value | Use |
| --- | --- | --- |
| `--color-canvas` | `#070a12` | OLED-friendly page canvas |
| `--color-ink` | `#f1f5f9` | Primary text |
| `--color-panel` | `rgba(15,23,42,.54)` | Frosted surfaces |
| `--color-panel-strong` | `rgba(20,31,51,.78)` | Drawers and toasts |
| `--color-stroke` | `rgba(148,163,184,.14)` | Dividers and panel edges |
| `--color-accent` | `#a78bfa` | Primary action / selected state |
| `--color-cyan` | `#67e8f9` | Focus, live state, data line |
| `--color-success` | `#34d399` | Healthy / available |
| `--color-warning` | `#fbbf24` | Reconnecting / review |
| `--color-danger` | `#fb7185` | Force release / destructive action |

## Component rules

- Every interactive element has a visible focus ring and a hit area of at least 44px.
- Navigation items include both icon and label; icons are Lucide SVGs, never emoji.
- Status always combines text and icon; color is not the sole carrier of meaning.
- Tables collapse into labeled row groups on narrow screens; avoid horizontal scrolling.
- Live surfaces show freshness (`2s ago`, heartbeat) so “real time” is verifiable.
- Credential values never render in the UI. Only session state and non-sensitive identifiers are shown.
