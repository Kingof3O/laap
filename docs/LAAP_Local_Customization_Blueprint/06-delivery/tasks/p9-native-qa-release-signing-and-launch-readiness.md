**v2.0 SKU gate:** Validate Basic as the unchanged current local app (minus Team), Studio as customization-only with online services, Complete as both. Three signed installed-app upgrades.

# P9 — Native QA, release signing and launch readiness

**Purpose:** Real native Windows/macOS smoke, signed upgrade compatibility, accessibility, performance and legal/commercial launch gates.

## Required source inventory for this milestone

- `apps/desktop/src/hooks/useUpdateChecker.ts` — Per-SKU signed channel, migration-compatible legacy feeds; Accurate compatibility/installability/release notice per SKU
- `apps/desktop/src-tauri/src/commands/updater.rs` — Per-SKU installer identity and signed manifest isolation; Do not weaken or rotate existing key; add Studio channel and full isolation
- `.github/workflows/release-desktop.yml` — Three signed SKU artifacts, manifests and release gates
- `.github/workflows/test-and-lint.yml` — Test matrix Rust/React by SKU and integration fixture sets
- `.github/workflows/security.yml` — License, secret, dependency, provenance and artifact checks
- `.github/workflows/verify-installer.yml` — Real clean Windows install and upgrade automation targets
- `scripts/generate-update-manifest.mjs` — Three-channel, edition-authenticated final payload signature validation
- `apps/desktop/src/styles/base.css` — Final typography/contrast/reduced motion and 960px overflow
- `apps/desktop/src/styles/header.css` — Unify customization nav and presence without clutter
- `apps/desktop/src/styles/modals.css` — Modal scroll/labels/focus and task progress consistency
- `apps/desktop/src/shared/ui/settings/AboutSettings.tsx` — LAAP logo and correct edition/legal credits, no creator name in UI
- `CHANGELOG.md` — Product migration and release notes without false support claims
- `CODE_SIGNING.md` — Three identities, signing sources, artifact contents and key handling
- `SECURITY.md` — Vulnerability intake for mods, marketplace and signatures
- `scripts/check-no-cloud-session-urls.mjs` — Static integration guard no new session material to community endpoints
- `scripts/check-licenses.mjs` — Third-party license/SBOM/attribution release gate
- `scripts/validate-mod-fixtures.mjs` — Safe import fixture reproducibility and integrity
- `scripts/verify-flavor-release.mjs` — All three products platform/arch signed artifacts and metadata
- `scripts/benchmark-local-cache.mjs` — Cache/import/preset benchmarks with reproducible dataset
- `apps/desktop/tests/ui/full-product-smoke.spec.ts` — Screen visual smoke all editions/viewport sizes
- `apps/desktop/tests/native/native-upgrade.test.md` — Native installed-version E2E test procedure and evidence contract
- `docs/customization/USER_GUIDE.md` — Local, Studio, Complete first-run and troubleshooting
- `docs/customization/ARCHITECTURE.md` — Resulting module and trust diagram after implementation
- `docs/customization/INTEGRATION_COMPATIBILITY.md` — Version/platform/adapter support and disabled features
- `docs/customization/MIGRATION_REPORT.md` — Actual Team retirement and encrypted vault backup evidence
- `docs/customization/RELEASE_READINESS.md` — Completed gate/CI/native/legal/marketplace acceptance
- `docs/customization/LEGAL_AND_ATTRIBUTION.md` — Riot disclaimer, GPL patcher license, creator rights and original assets
- `docs/customization/PRIVACY.md` — Local-first storage and optional online data flows

## Implementation protocol

1. Read root `AGENTS.md`, relevant `04-features` specs and source/legality docs.
2. Recheck latest code; implement the listed files and supporting tests with no placeholders.
3. Check actual behavior, error/offline/rollback states and platform capability boundaries.
4. Run current frontend/Rust checks, source test suites and native platform tests where available.
5. Capture screenshots of affected UI at 960×640, 1160×760 and 1440×900; fix clipping/contrast and then freeze styling once accepted.
6. Track every related `FEATURE_PARITY_MATRIX.csv` row with evidence and policy decision.
7. Deliver diff, test logs, migration/rollback and external blockers; no fake native installation claim and no production release.

## Acceptance gate

Real native Windows/macOS smoke, signed upgrade compatibility, accessibility, performance and legal/commercial launch gates.

See `06-delivery/QUALITY_GATES.md` and `06-delivery/IMPLEMENTATION_PLAN.md` for exact tests and sequencing. Do not claim this milestone complete if restricted features are just mock buttons or if the relevant external permissions are missing.
