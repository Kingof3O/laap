**v2.0 SKU gate:** This phase is scoped to Studio and Complete only for new customization functionality. Basic must stay existing LAAP Offline with no new Studio features.

# P2 — Metadata catalog/cache/presets

**Purpose:** Cached lawful metadata browsable offline, fast search, reliable presets and per-account bindings, real client untouched.

## Required source inventory for this milestone

- `apps/desktop/src-tauri/src/customization/mod.rs` — Customization Rust domain root and service registry
- `apps/desktop/src-tauri/src/customization/models.rs` — Versioned Rust model types and deterministic validation
- `apps/desktop/src-tauri/src/customization/catalog.rs` — Static provider integration, patch/locale-aware metadata cache
- `apps/desktop/src-tauri/src/customization/content_store.rs` — Immutable SHA256 content storage with quotas and cleanup
- `apps/desktop/src-tauri/src/customization/database.rs` — Metadata index and transactional schema migrations
- `apps/desktop/src-tauri/src/customization/presets.rs` — Per-champion/per-account scoped preset resolver
- `apps/desktop/src-tauri/src/customization/tasks.rs` — Async bounded task queue with status, cancellation and dedupe
- `apps/desktop/src-tauri/src/customization/commands.rs` — Typed Tauri command facade, no arbitrary filesystem shell
- `apps/desktop/src-tauri/src/customization/locale.rs` — Source localization and fallback for metadata
- `apps/desktop/src/features/customization/catalog/CatalogPage.tsx` — Champion catalog responsive virtual grid
- `apps/desktop/src/features/customization/catalog/ChampionDetailPage.tsx` — Skin/chroma/variant preview and source/rights metadata
- `apps/desktop/src/features/customization/catalog/useCatalog.ts` — Typed query/state and offline stale-cache fallback
- `apps/desktop/src/features/customization/catalog/ChampionCard.tsx` — Accessible champion tile with real loading and error visuals
- `apps/desktop/src/features/customization/catalog/SkinGallery.tsx` — Responsive skin metadata gallery with lazy media
- `apps/desktop/src/features/customization/catalog/ChromaPicker.tsx` — Accessible chroma swatches, non-ownership claiming
- `apps/desktop/src/features/customization/presets/PresetsPage.tsx` — Preset library, folders, clone/import/export and versioning
- `apps/desktop/src/features/customization/presets/PresetEditor.tsx` — Account/champion/game-mode overrides with conflict preview
- `apps/desktop/src/features/customization/presets/usePresets.ts` — Native preset CRUD and controlled persistence
- `apps/desktop/src/features/customization/presets/PresetBinding.tsx` — Account-card compact optional preset selector
- `apps/desktop/src/features/customization/doctor/DoctorPage.tsx` — Diagnostics and filesystem/cache health
- `apps/desktop/src/lib/customizationApi.ts` — Typed desktop wrapper for domain commands
- `apps/desktop/src/shared/ui/AssetCard.tsx` — Reusable lazy preview with source/rights/loading badge
- `apps/desktop/src/shared/ui/MediaPreview.tsx` — Safe lazy media viewer and original-asset fallback
- `apps/desktop/src/shared/ui/CapabilityNotice.tsx` — Supported/unsupported/policy-gated explanation
- `apps/desktop/src/shared/ui/ProgressTask.tsx` — Real progress/cancel/retry for native tasks
- `apps/desktop/src/styles/customization.css` — Modular shared customization component styles
- `apps/desktop/tests/customization-catalog.test.ts` — Patch version, null metadata, locale fallback and offline cache
- `apps/desktop/tests/presets.test.ts` — Full deterministic override/migration algorithm tests
- `apps/desktop/tests/cache.test.ts` — Immutable cache, dedupe, safe evictions and quotas
- `apps/desktop/tests/ui/catalog.spec.ts` — Catalog and preset journeys, no fake asset ownership

## Implementation protocol

1. Read root `AGENTS.md`, relevant `04-features` specs and source/legality docs.
2. Recheck latest code; implement the listed files and supporting tests with no placeholders.
3. Check actual behavior, error/offline/rollback states and platform capability boundaries.
4. Run current frontend/Rust checks, source test suites and native platform tests where available.
5. Capture screenshots of affected UI at 960×640, 1160×760 and 1440×900; fix clipping/contrast and then freeze styling once accepted.
6. Track every related `FEATURE_PARITY_MATRIX.csv` row with evidence and policy decision.
7. Deliver diff, test logs, migration/rollback and external blockers; no fake native installation claim and no production release.

## Acceptance gate

Cached lawful metadata browsable offline, fast search, reliable presets and per-account bindings, real client untouched.

See `06-delivery/QUALITY_GATES.md` and `06-delivery/IMPLEMENTATION_PLAN.md` for exact tests and sequencing. Do not claim this milestone complete if restricted features are just mock buttons or if the relevant external permissions are missing.
