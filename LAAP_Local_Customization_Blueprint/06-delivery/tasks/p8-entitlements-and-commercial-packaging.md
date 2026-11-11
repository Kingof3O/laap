# P8 — Entitlements and commercial packaging

**Purpose:** Commerce sandbox with server-signed entitlements and offline grace; paid product gated until Riot/merchant approval.

## Required source inventory for this milestone

- `apps/desktop/src-tauri/src/commerce/mod.rs` — Signed entitlement verification module
- `apps/desktop/src-tauri/src/commerce/license.rs` — Offline-grace signature verified license and SKU gating
- `apps/desktop/src-tauri/src/commerce/keyring.rs` — Secure local license store without Riot vault coupling
- `apps/community-api/src/routes/entitlements.ts` — Activate/revoke/validate signed claims
- `apps/community-api/src/routes/payments.ts` — Verified MoR webhooks, no card storage
- `apps/community-api/src/services/entitlements.ts` — Policy-driven entitlements and replay safety
- `apps/desktop/src/features/customization/commerce/LicensePage.tsx` — SKU status, restore, activate and trial status
- `apps/desktop/src/features/customization/commerce/UpgradeDialog.tsx` — Transparent premium feature upgrade UI
- `apps/desktop/src/features/customization/settings/NetworkPrivacySettings.tsx` — Per-service separate consent, no all-or-nothing toggle
- `apps/desktop/src/features/customization/settings/IntegrationSettings.tsx` — Installed tooling, languages, network and performance settings
- `apps/desktop/src/features/customization/settings/AboutCustomization.tsx` — Legal credits, safety disclosures, version, logo
- `apps/desktop/tests/entitlements.test.ts` — Signed license claims, expiry, grace, feature checks
- `apps/community-api/tests/payment-webhook.test.ts` — Webhook verification, replay idempotency, refund and revocation
- `apps/desktop/tests/ui/commerce.spec.ts` — Offline grace + free features and paywall copy correctness

## Implementation protocol

1. Read root `AGENTS.md`, relevant `04-features` specs and source/legality docs.
2. Recheck latest code; implement the listed files and supporting tests with no placeholders.
3. Check actual behavior, error/offline/rollback states and platform capability boundaries.
4. Run current frontend/Rust checks, source test suites and native platform tests where available.
5. Capture screenshots of affected UI at 960×640, 1160×760 and 1440×900; fix clipping/contrast and then freeze styling once accepted.
6. Track every related `FEATURE_PARITY_MATRIX.csv` row with evidence and policy decision.
7. Deliver diff, test logs, migration/rollback and external blockers; no fake native installation claim and no production release.

## Acceptance gate

Commerce sandbox with server-signed entitlements and offline grace; paid product gated until Riot/merchant approval.

See `06-delivery/QUALITY_GATES.md` and `06-delivery/IMPLEMENTATION_PLAN.md` for exact tests and sequencing. Do not claim this milestone complete if restricted features are just mock buttons or if the relevant external permissions are missing.
