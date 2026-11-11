**v2.0 SKU gate:** This phase is scoped to Studio and Complete only for new customization functionality. Basic must stay existing LAAP Offline with no new Studio features.

# P5 — Original creator workshop

**Purpose:** Generated legal fixture project import/edit/export/repair with diff and crash recovery; no bypass/proprietary assets.

## Required source inventory for this milestone

- `apps/desktop/src-tauri/src/creator/mod.rs` — Creator service registry
- `apps/desktop/src-tauri/src/creator/projects.rs` — Versioned project workspace, autosave and safe import
- `apps/desktop/src-tauri/src/creator/inspector.rs` — Read-only archive/property and safe binary metadata inspection
- `apps/desktop/src-tauri/src/creator/conversion.rs` — Reviewed licensed converters, no bypass or raw shell
- `apps/desktop/src-tauri/src/creator/repair.rs` — Benign user-created mod fixes with diff and rollback
- `apps/desktop/src-tauri/src/creator/packager.rs` — Deterministic legal creator packaging and hash manifests
- `apps/desktop/src-tauri/src/creator/diff.rs` — Asset tree diff without rewriting input
- `apps/desktop/src/features/customization/creator/CreatorPage.tsx` — Workbench files/projects browser
- `apps/desktop/src/features/customization/creator/ProjectEditor.tsx` — Tabbed workspace with undo/autosave
- `apps/desktop/src/features/customization/creator/ArchiveExplorer.tsx` — Paginated safe archive tree and filters
- `apps/desktop/src/features/customization/creator/PropertyInspector.tsx` — Metadata viewer/editor for supported user assets
- `apps/desktop/src/features/customization/creator/TextureInspector.tsx` — Licensed texture previews with caps
- `apps/desktop/src/features/customization/creator/ModRepairDialog.tsx` — Before/after repair diff and explicit confirmation
- `apps/desktop/src/features/customization/creator/ExportBuilder.tsx` — Rights-aware creator package export
- `apps/desktop/tests/creator-roundtrip.test.ts` — Generated legal fixture project import/edit/export
- `apps/desktop/tests/creator-crash-recovery.test.ts` — Autosave/rollback and large files
- `apps/desktop/tests/ui/creator.spec.ts` — Creator workspace flows, no dead controls

## Implementation protocol

1. Read root `AGENTS.md`, relevant `04-features` specs and source/legality docs.
2. Recheck latest code; implement the listed files and supporting tests with no placeholders.
3. Check actual behavior, error/offline/rollback states and platform capability boundaries.
4. Run current frontend/Rust checks, source test suites and native platform tests where available.
5. Capture screenshots of affected UI at 960×640, 1160×760 and 1440×900; fix clipping/contrast and then freeze styling once accepted.
6. Track every related `FEATURE_PARITY_MATRIX.csv` row with evidence and policy decision.
7. Deliver diff, test logs, migration/rollback and external blockers; no fake native installation claim and no production release.

## Acceptance gate

Generated legal fixture project import/edit/export/repair with diff and crash recovery; no bypass/proprietary assets.

See `06-delivery/QUALITY_GATES.md` and `06-delivery/IMPLEMENTATION_PLAN.md` for exact tests and sequencing. Do not claim this milestone complete if restricted features are just mock buttons or if the relevant external permissions are missing.
