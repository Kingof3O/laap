# P7 — Marketplace and optional providers

**Purpose:** Moderated rights-cleared catalog, report/takedown and provider opt-in; zero executable or protected content distribution.

## Required source inventory for this milestone

- `apps/community-api/src/routes/catalog.ts` — Public approved mod metadata search and pagination
- `apps/community-api/src/routes/submissions.ts` — Rights-attested uploads to quarantine
- `apps/community-api/src/routes/reports.ts` — Copyright/abuse complaints and takedown requests
- `apps/community-api/src/storage/contentStore.ts` — Signed object access and immutable content hashes
- `apps/community-api/src/storage/metadataStore.ts` — Moderation states and creator attribution
- `apps/community-api/src/security/webhook.ts` — Future payment/MoR signature validation and replay
- `apps/community-admin/package.json` — Optional creator/moderation dashboard package
- `apps/community-admin/src/App.tsx` — Moderator/creator UI route shell
- `apps/community-admin/src/pages/ReviewQueue.tsx` — Moderation and copyright/compliance review
- `apps/community-admin/src/pages/CreatorProfiles.tsx` — Attribution and rights verification
- `apps/community-admin/src/pages/Reports.tsx` — Takedown, appeal and audit workflow
- `apps/desktop/src/features/customization/marketplace/MarketplacePage.tsx` — Moderated catalog and rights-aware downloads
- `apps/desktop/src/features/customization/marketplace/MarketplaceDetail.tsx` — Creator/source/license and patch notes
- `apps/desktop/src/features/customization/marketplace/ReportModDialog.tsx` — User report and safe download cancellation
- `apps/desktop/src/features/customization/integrations/StatsPage.tsx` — Provider-permitted stats with source/freshness
- `apps/desktop/src/features/customization/integrations/VoiceAssistantPage.tsx` — Opt-in creator AI/TTS with privacy/price warning
- `apps/desktop/src-tauri/src/integrations/opgg.rs` — Authorized stats connector with quotas/permission
- `apps/desktop/src-tauri/src/integrations/voice.rs` — TTS connector with opt-in and no gameplay hints
- `apps/community-api/tests/moderation.test.ts` — Rights validation, asset upload, takedown and report tests
- `apps/community-admin/tests/moderation-ui.spec.ts` — Reviewer permissions and queues

## Implementation protocol

1. Read root `AGENTS.md`, relevant `04-features` specs and source/legality docs.
2. Recheck latest code; implement the listed files and supporting tests with no placeholders.
3. Check actual behavior, error/offline/rollback states and platform capability boundaries.
4. Run current frontend/Rust checks, source test suites and native platform tests where available.
5. Capture screenshots of affected UI at 960×640, 1160×760 and 1440×900; fix clipping/contrast and then freeze styling once accepted.
6. Track every related `FEATURE_PARITY_MATRIX.csv` row with evidence and policy decision.
7. Deliver diff, test logs, migration/rollback and external blockers; no fake native installation claim and no production release.

## Acceptance gate

Moderated rights-cleared catalog, report/takedown and provider opt-in; zero executable or protected content distribution.

See `06-delivery/QUALITY_GATES.md` and `06-delivery/IMPLEMENTATION_PLAN.md` for exact tests and sequencing. Do not claim this milestone complete if restricted features are just mock buttons or if the relevant external permissions are missing.
