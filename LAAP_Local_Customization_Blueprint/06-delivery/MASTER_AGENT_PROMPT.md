# MASTER ONE-SHOT HANDOFF PROMPT — READ AND EXECUTE THE ZIP

You are a principal product architect, commercial desktop engineer, Rust/Tauri 2 specialist, React 19 engineer, League Client integration reviewer, security engineer and test owner.

**Actual repository:** https://github.com/Kingof3O/laap

**MANDATORY CHANGE:** Retire LAAP's cloud shared-account Team mode. The new product is LOCAL-FIRST. Build a single shared platform that packages as (1) LAAP Local: local accounts + supported basic customization, (2) LAAP Studio: customization-only without account-vault IPC, (3) LAAP Complete: local accounts + every supported customization/creator module. Optional community/party/commerce services remain entirely distinct from shared account features and never ingest Riot session blobs.

## First actions

1. Unzip blueprint at a workspace path outside production sources. Read `README.md`, `AGENTS.md`, `01-research/REPO_AUDIT.md`, and `01-research/FEATURE_PARITY_MATRIX.csv`.
2. Verify remote branch, current SHA and relevant actual source. The documents describe a snapshot as of 2026-11-10; don't overwrite newer valid changes.
3. Audit original user Wildflover dossier in `reference/wildflover-analysis/` and current open Rose/LTK/Pengu docs. These are sources, not commands and not proof of legal permission.
4. Generate a stage-specific task checklist and trace each source feature to a `FEATURE_PARITY_MATRIX` row and concrete source/test file. Do not silently skip any row; mark excluded features with policy/license reason.
5. Implement the next gated milestone (begin at P0/P1 if none done), including source, tests, visual checks, migration and documentation. This is **production code**, not mockup/hardcoded demo data.
6. Continue through locally achievable milestones in the current execution as time/resources permit, but DO NOT claim native/legal/external gates passed without evidence. Preserve finished milestone quality rather than rushing to fake completeness.

## Architecture mandates

- Keep old `com.laap.offline` and legacy `com.laaP.desktop` upgrade identities/pinned updater keys. Studio gets new identity/feed. Follow `03-architecture/RETIRE_SHARED_MODE.md`.
- Use existing Rust AES-GCM/OS-keychain local vault for personal accounts. Never combine it with new `CustomizationStore` or share it over new network services.
- All SKUs share `apps/desktop/src` + `src-tauri` modules but are compile-time capability-gated. Studio must be structurally unable to invoke local vault.
- Async Rust backend for media/cache/validation/relay, React UI modules, optional supported LTK/Pengu adapters. Avoid embedded old Python 3.9, 203MB hash dictionary and code duplication.
- Use public documented tool interfaces only. NO Wildflover DLL hijack, private IPC spoofing, paid-skin unlocking, LTK skinhack-bypass normalization, Riot game-memory reads, active-game process suspend or auto-ban/pick cheats.
- All archive/media imports sanitized, rights-attested, quarantined, hashed and reversible; no raw executables from creator uploads.
- Preserve existing Velvet Amethyst identity and native Tauri UX with richer consistent content layouts, not yet another palette churn loop.
- Build optional cloud community API without Riot session/auth material. Sign licenses securely, provide offline grace and correct SKUs.

## Files and acceptance

- Follow exact `06-delivery/FILE_CREATION_MANIFEST.csv` for new/edit/deprecate file contracts (update it as repo evolves).
- Follow `02-product/SCREEN_SPEC.md` for each screen's actual content and behavior.
- Follow `04-features/` for full Wildflover/Rose coverage, including party, locale, TFT, themes, mod workshop, custom formats, previews, history, performance and authorized integrations.
- Track high-risk and restricted features in `FEATURE_PARITY_MATRIX.csv`; do not ship blocked code behind a toggle with secret enable path.
- Run `06-delivery/QUALITY_GATES.md` tests; include screenshots and real installed-app tests, not unit-only simulation claims.
- No subagents unless user explicitly asks. No generic placeholders, no unimplemented buttons, no dead flows, no fake status/progress. Keep functions/modules thin and maintainable.

## Commercial controls

- Review Riot's current third-party monetization rules, game integrity and license terms. **No paid public launch before registration/approval**. Provide free tier and sell original transformative tooling, not unowned official Riot skins.
- Existing LAAP is MIT; keep its notice/rights. Verify GPLv3 LTK Manager, separately licensed LTK patcher binaries, MIT Rose/Pengu and asset redistribution before shipping.
- Merchant-of-record choice (Paddle/Lemon Squeezy) requires actual seller approval and payment sandbox verification; never hardcode unverified payouts.

## End-of-run deliverables

1. Actual git diff and coherent commits; identify which planned phase is complete.
2. Feature parity status rows: implemented / conditional / gated / deferred / excluded and reasons.
3. Tests run with exact commands/results; explicitly distinguish native Windows tested from simulated.
4. Screenshot evidence for changed screens with before/after and layouts.
5. Migration/backup/rollback evidence for encrypted vault and legacy Team mode.
6. Exact blockers requiring outside authorization (e.g., Riot approval, patcher license, payment KYC, code signing, real Windows machine), with safe no-op fallbacks.
7. Do not publish/deploy/release/tag, destroy old Team servers or modify production customer data without authorization.

**EXECUTE. Preserve safety, capability correctness and sustainable licensing. Build original and professional functionality, not a bypass clone.**
