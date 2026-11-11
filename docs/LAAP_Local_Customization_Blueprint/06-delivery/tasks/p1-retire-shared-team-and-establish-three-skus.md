**v2.0 SKU gate:** Basic regression + SKU isolation only; preserve existing accounts. New Studio features may not be added to Basic.

# P1 — Retire shared Team and establish three SKUs

**Purpose:** All three SKUs compile; Basic vault preserved; Studio exposes zero vault IPC and no new Team leases; migration reversible.

## Required source inventory for this milestone

- `apps/desktop/src/App.tsx` — Remove Team view route; add capability-aware navigation and migration entrypoint
- `apps/desktop/src/lib/api.ts` — Eliminate Team API requests in new flavors; separate network consent and community client
- `apps/desktop/src/lib/types.ts` — Replace AppMode Team with product flavor/capability types
- `apps/desktop/src/features/personal-roster/PersonalRosterView.tsx` — Preserve existing Basic local roster EXACTLY; add account-linked preset affordance ONLY in Complete
- `apps/desktop/src-tauri/src/lib.rs` — Register domain commands per compiled capability and preserve updater/process safety
- `apps/desktop/src-tauri/src/local_store/models.rs` — No new Basic profile schema requirement; optional preset reference ONLY if Complete needs it with backward-compatible migration
- `apps/desktop/src-tauri/src/local_store/manager.rs` — Preserve existing Basic vault without changes; support preset binding in Complete only
- `apps/desktop/src-tauri/src/launcher_settings.rs` — Move to versioned preferences migration and domain grouping
- `apps/desktop/src-tauri/tauri.conf.json` — Complete flavor alias; keep original Team install identifier during migration
- `apps/desktop/src-tauri/tauri.offline.conf.json` — Basic flavor; preserve old Offline identifier, key and feed
- `apps/desktop/src-tauri/capabilities/default.json` — Minimal Tauri capabilities by compiled SKU and command set
- `apps/desktop/src-tauri/src/riot/operation.rs` — Expose safe launch/apply/update cross-operation coordinator
- `apps/desktop/src-tauri/src/commands/local_accounts.rs` — Retain existing IPC semantics; explicit capability gate for Studio
- `apps/desktop/src/shared/ui/Header.tsx` — Replace Team toggle with shared product navigation
- `apps/desktop/src/shared/ui/SettingsModal.tsx` — Show only relevant settings per SKU and integration consent
- `apps/desktop/src/shared/ui/SubNavbar.tsx` — Per-feature toolbar slots, compact and accessible
- `apps/desktop/src/styles/tokens.css` — Continue consistent Velvet Amethyst semantic tokens
- `apps/desktop/src/styles/workspace.css` — Extend desktop layout for customization routes
- `apps/desktop/src/features/team-vault/TeamVaultView.tsx` — Deprecate from active product and migrate through separate legacy screen
- `apps/desktop/src/features/auth/useAuth.ts` — Deprecate Team account auth from active product
- `apps/desktop/src/features/device/useDevice.ts` — Deprecate Team device identity from active product
- `apps/desktop/src/hooks/useUpdateChecker.ts` — Per-SKU signed channel, migration-compatible legacy feeds; Accurate compatibility/installability/release notice per SKU
- `apps/desktop/src-tauri/src/commands/updater.rs` — Per-SKU installer identity and signed manifest isolation; Do not weaken or rotate existing key; add Studio channel and full isolation
- `README.md` — Update edition table and remove unsupported zero-ban claim
- `PRIVACY.md` — Disclose optional mod/theme/party/network capabilities accurately
- `docs/ARCHITECTURE.md` — Document new domains and Team retirement
- `docs/SECURITY_MODEL.md` — Document new trust boundaries and anti-cheat uncertainty
- `apps/desktop/src/product/flavors.ts` — Canonical feature capability definitions for Basic, Studio, Complete
- `apps/desktop/src/product/capabilities.ts` — Typed capability resolver and platform constraints
- `apps/desktop/src/product/featurePolicies.ts` — Versioned default-deny policy gates independent from paid entitlements
- `apps/desktop/src/product/navigation.ts` — Capability-derived route registry and discoverable unsupported states
- `apps/desktop/src/product/FlavorProvider.tsx` — Dependency-injected product flavor context
- `apps/desktop/src/product/FlavorGate.tsx` — Accessible UI gate with clear feature reason
- `apps/desktop/src-tauri/tauri.studio.conf.json` — New Studio product name, unique identifier, key and signed feed
- `apps/desktop/src-tauri/tauri.complete.conf.json` — Complete identity overlay, preserving legacy install ID
- `apps/desktop/src-tauri/tauri.local.conf.json` — Optional Basic identity overlay, preserving Offline ID; prefer existing tauri.offline.conf.json
- `apps/desktop/src-tauri/src/product.rs` — Compile-time native capability enum and command registration helpers
- `apps/desktop/src/features/legacy-team/LegacyMigrationView.tsx` — Explicit read-only authorized Team export and transition instructions
- `apps/desktop/src/features/legacy-team/useLegacyMigration.ts` — Minimal legacy API access with lease release and no secret import
- `apps/desktop/src-tauri/src/legacy_team/migration.rs` — Non-destructive archival/transition state and readiness
- `apps/desktop/src-tauri/src/legacy_team/mod.rs` — Temporary isolated legacy helper gate, removable after sunset
- `apps/desktop/tests/flavors.test.ts` — Flavor-specific capabilities and no hidden dangerous routes
- `apps/desktop/tests/legacy-team-migration.test.ts` — Old Team metadata export, lease cleanup and no session secret import
- `apps/desktop/tests/ui/flavor-navigation.spec.ts` — End-to-end route availability per flavor
- `apps/desktop/tests/native/studio-no-vault.rs` — Native proof Studio binary cannot invoke vault commands
- `scripts/check-edition-isolation.mjs` — Compare SKU compiled assets and native capabilities/identifiers
- `scripts/generate-sku-release-matrix.mjs` — Build expected update artifact/manifest identity table

## Implementation protocol

1. Read root `AGENTS.md`, relevant `04-features` specs and source/legality docs.
2. Recheck latest code; implement the listed files and supporting tests with no placeholders.
3. Check actual behavior, error/offline/rollback states and platform capability boundaries.
4. Run current frontend/Rust checks, source test suites and native platform tests where available.
5. Capture screenshots of affected UI at 960×640, 1160×760 and 1440×900; fix clipping/contrast and then freeze styling once accepted.
6. Track every related `FEATURE_PARITY_MATRIX.csv` row with evidence and policy decision.
7. Deliver diff, test logs, migration/rollback and external blockers; no fake native installation claim and no production release.

## Acceptance gate

All three SKUs compile; Basic vault preserved; Studio exposes zero vault IPC and no new Team leases; migration reversible.

See `06-delivery/QUALITY_GATES.md` and `06-delivery/IMPLEMENTATION_PLAN.md` for exact tests and sequencing. Do not claim this milestone complete if restricted features are just mock buttons or if the relevant external permissions are missing.
