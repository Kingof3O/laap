**v2.0 SKU gate:** This phase is scoped to Studio and Complete only for new customization functionality. Basic must stay existing LAAP Offline with no new Studio features.

# P3 — Validated custom mod library and approved adapters

**Purpose:** User-created mods import securely, show legal/compatibility health, and preserve original; unsupported patcher stays disabled.

## Required source inventory for this milestone

- `apps/desktop/src-tauri/src/customization/importer.rs` — Strict archive quarantine and format magic verification
- `apps/desktop/src-tauri/src/customization/archive.rs` — Safe extraction with path/depth/size constraints
- `apps/desktop/src-tauri/src/customization/mod_library.rs` — Mod registry, states, licenses, sha hashes and versions
- `apps/desktop/src-tauri/src/customization/validator.rs` — Mod integrity, legal-rights, compatibility and content scans
- `apps/desktop/src-tauri/src/customization/conflicts.rs` — Mod dependency and exclusive path conflict graph
- `apps/desktop/src-tauri/src/customization/adapter.rs` — Documented external tool discovery and capability matrix
- `apps/desktop/src-tauri/src/customization/operation_journal.rs` — Atomic apply/import rollback journal
- `apps/desktop/src-tauri/src/customization/rights.rs` — Attribution, license and user content permissions
- `apps/desktop/src/features/customization/mods/MyModsPage.tsx` — Installed/draft/quarantine library overview
- `apps/desktop/src/features/customization/mods/ModDetailPage.tsx` — Source, author, dependency and safe workflow UI
- `apps/desktop/src/features/customization/mods/ModImportDialog.tsx` — Consent-based drag drop, detailed inspection and quarantine
- `apps/desktop/src/features/customization/mods/ModHealthView.tsx` — Compatibility and adapter state with actionable remediation
- `apps/desktop/src/features/customization/mods/ConflictInspector.tsx` — Non-destructive conflict previews and ordering
- `apps/desktop/src/features/customization/mods/useModLibrary.ts` — Typed local data hooks without cloud session links
- `apps/desktop/src/features/customization/mods/ModRightsForm.tsx` — Creator rights attribution and redistribution flags
- `apps/desktop/src/features/customization/doctor/AdapterHealthPanel.tsx` — No silent install; show exact external tool status
- `apps/desktop/tests/mod-import-security.test.ts` — Zip bombs/path traversal/executable detection and fuzz fixtures
- `apps/desktop/tests/adapter-contract.test.ts` — Fake documented adapter protocol and native explicit gate
- `apps/desktop/tests/ui/mod-library.spec.ts` — Import/undo/conflict/detail flow with safe test assets

## Implementation protocol

1. Read root `AGENTS.md`, relevant `04-features` specs and source/legality docs.
2. Recheck latest code; implement the listed files and supporting tests with no placeholders.
3. Check actual behavior, error/offline/rollback states and platform capability boundaries.
4. Run current frontend/Rust checks, source test suites and native platform tests where available.
5. Capture screenshots of affected UI at 960×640, 1160×760 and 1440×900; fix clipping/contrast and then freeze styling once accepted.
6. Track every related `FEATURE_PARITY_MATRIX.csv` row with evidence and policy decision.
7. Deliver diff, test logs, migration/rollback and external blockers; no fake native installation claim and no production release.

## Acceptance gate

User-created mods import securely, show legal/compatibility health, and preserve original; unsupported patcher stays disabled.

See `06-delivery/QUALITY_GATES.md` and `06-delivery/IMPLEMENTATION_PLAN.md` for exact tests and sequencing. Do not claim this milestone complete if restricted features are just mock buttons or if the relevant external permissions are missing.
