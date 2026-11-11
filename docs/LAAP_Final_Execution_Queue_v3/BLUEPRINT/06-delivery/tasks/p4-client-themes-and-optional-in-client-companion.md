**v2.0 SKU gate:** This phase is scoped to Studio and Complete only for new customization functionality. Basic must stay existing LAAP Offline with no new Studio features.

# P4 — Client themes and optional in-client companion

**Purpose:** Original themes preview/undo without game restart; optional Pengu plugin safe, licensed and only applied where proven.

## Required source inventory for this milestone

- `apps/desktop/src-tauri/src/themes/mod.rs` — Theme domain registration and preferences
- `apps/desktop/src-tauri/src/themes/models.rs` — Theme and per-surface media configuration schema
- `apps/desktop/src-tauri/src/themes/media.rs` — User media validation, size caps, conversion and preview cache
- `apps/desktop/src-tauri/src/themes/manager.rs` — Theme stage/activate/undo with transaction journal
- `apps/desktop/src-tauri/src/themes/pengu_adapter.rs` — Optional approved loader version/health and scoped interface
- `apps/desktop/src/features/customization/themes/ThemesPage.tsx` — Theme gallery and editing entry point
- `apps/desktop/src/features/customization/themes/ThemeEditor.tsx` — Surface/media/font/music/transition editor
- `apps/desktop/src/features/customization/themes/SurfacePreview.tsx` — Accurate LAAP preview without Riot UI counterfeit
- `apps/desktop/src/features/customization/themes/ThemeMediaPicker.tsx` — Image/GIF/video selection, license and resource budget
- `apps/desktop/src/features/customization/themes/AudioSettings.tsx` — User music, volume and stop controls
- `apps/desktop/src/features/customization/themes/ThemeApplyDialog.tsx` — Consent and safe defer/rollback confirmation
- `apps/desktop/src/features/customization/themes/useThemes.ts` — Typed theme states and persist/recovery
- `apps/client-companion/README.md` — Optional independently enabled in-client extension architecture
- `apps/client-companion/src/index.ts` — Client plugin entry with supported lifecycle and safe unload
- `apps/client-companion/src/bridge.ts` — Narrow authenticated 127.0.0.1 RPC, no arbitrary Tauri invoke
- `apps/client-companion/src/ChampSelectPanel.tsx` — Optional in-client approved selector, no paid unlock
- `apps/client-companion/src/PartyPanel.tsx` — Optional in-client party selection/readiness status
- `apps/client-companion/src/i18n.ts` — Locale-aware in-client UI fallback
- `apps/desktop/tests/themes.test.ts` — Media/rollback/permissions/runtime failure
- `apps/desktop/tests/ui/themes.spec.ts` — Theme editor, modal, offline and min-resolution tests

## Implementation protocol

1. Read root `AGENTS.md`, relevant `04-features` specs and source/legality docs.
2. Recheck latest code; implement the listed files and supporting tests with no placeholders.
3. Check actual behavior, error/offline/rollback states and platform capability boundaries.
4. Run current frontend/Rust checks, source test suites and native platform tests where available.
5. Capture screenshots of affected UI at 960×640, 1160×760 and 1440×900; fix clipping/contrast and then freeze styling once accepted.
6. Track every related `FEATURE_PARITY_MATRIX.csv` row with evidence and policy decision.
7. Deliver diff, test logs, migration/rollback and external blockers; no fake native installation claim and no production release.

## Acceptance gate

Original themes preview/undo without game restart; optional Pengu plugin safe, licensed and only applied where proven.

See `06-delivery/QUALITY_GATES.md` and `06-delivery/IMPLEMENTATION_PLAN.md` for exact tests and sequencing. Do not claim this milestone complete if restricted features are just mock buttons or if the relevant external permissions are missing.
