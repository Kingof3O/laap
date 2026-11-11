## Product contract superseding prior draft
- **Basic** = existing offline/local launcher only; preserve current features and remove active Team/cloud shared account mode. Do NOT build customization features into Basic at any phase.
- **Studio** = all supported Wildflover/Rose-inspired features, including optional online party, shop, creator, Discord, provider/AI features; zero account vault.
- **Complete** = Basic + Studio with locally stored account-bound presets and the same optional online Studio features.
- Phases P2-P8 implement **Studio + Complete only**. P1 builds all SKUs and migrates legacy Team without data loss. P9 tests all three separately.

# Implementation Plan — Sequenced, Verifiable Milestones

**Do not attempt to deliver a fake "fully completed" 150+ file implementation from one untested commit.** This is a comprehensive phased build for a capable agent: every phase results in working code, tests, screenshots/docs and a completion report. Implement phases without interrupting the user for trivial choices; halt only irreversible legal/release approval decisions. No subagents by default.

## Phase P0 — Ground truth and approvals [precondition to commercial launch]

- Rebase on current `main`; read `REPO_AUDIT.md`, compare actual file tree, produce `docs/customization/repo-diff.md` and updated feature matrix.
- Document Riot policy and tool licenses; ask for product registration/approval, patcher redistribution and third-party API rights outside code execution.
- Identify customer assets/licenses; no secret/Riot IP redistribution. Audit existing account mode for compliant migration.
- Build versioned feature flags with default-deny gates for risky functions.
- Exit: accurate repo baseline, license inventory, migration backups, green CI.

## Phase P1 — Safe retire Team and define build flavors

- Introduce `AppFlavor` enum/capability matrix, feature compile guard, route registry and proper native command registration.
- Preserve Basic vault. Add **Legacy Team Migration** view for existing Team identity, with authorized metadata export and explicit local re-login guidance.
- Remove Team mode from new navigation; no Team lease requests in new app or Studio.
- Keep server infrastructure until authorized decommission; dual-read compatibility only during migration.
- Add config overlays for `basic`, `studio`, `complete`; preserve existing install IDs and updater feeds.
- Exit: all three editions launch; Studio cannot call vault IPC; no shared account session acquired; old installations upgrade safely in isolated E2E.

## Phase P2 — Studio/Complete customization storage / catalog / presets

- Create Rust content-addressed cache/index, importer quarantine, schemas, schema migrations, catalog provider and fixture data.
- React catalog browser with search, champion/skin/chroma metadata, favorites, random/history choices, controlled preview, per-account preset references.
- Offline cache, error states, Data Dragon compliance/locale; don't unlock official skins.
- Exit: supports thousands of entries, no connection required to browse cache, old vault bytes unchanged; robust format tests.

## Phase P3 — Community mod library and safe creator base

- Import `.fantome`/`.modpkg`/safe ZIP, rights manifest, thumbnail previews, SHA256, duplicate handling, compatibility inspector, dependency/conflict graph, safe undo/export.
- Developer archive explorer and metadata editor for user-authored/legal assets; no compiled exploit/anti-skinhack normalizer.
- External approved adapter discovery and health, but no automatic application unless explicit platform/legal gate open.
- Exit: no executable in mod store, archive fuzzer passes, 100% reversible import/export and patch compatibility reporting.

## Phase P4 — Themes + optional Pengu plugin

- Theme gallery/editor, backgrounds per supported surface, media/font/music/transition controls, offline preview and rollback.
- External loader integration requires user consent, actual version/license support and valid platform test. In-client picker plugin kept behind capability/policy gate.
- Exit: user-provided theme can be previewed, staged and undone; no Riot process forcibly restarted during game.

## Phase P5 — Creator Pro + compatibility/repair

- Binary/texture/archive inspectors through reviewed licensed tools, versioned projects, metadata editor, diff, safe repair of user-created mods, packaging and signed creator manifest.
- Only original/authorized assets; no paid official skin extraction or validator bypass.
- Exit: project import→edit→export round trip with generated legal fixtures, crash recovery and memory bound.

## Phase P6 — Optional party and Discord

- Implement separate community relay identity, room protocols and UI. Metadata-only sync first, rejoin/backoff, duplicate-member protection, short-lived invites and privacy choices.
- Discord opt-in Rich Presence; content transfer separately gated with rights/malware controls.
- Exit: 7-person chaos test, no Riot vault leakage, disconnection doesn't affect account launch.

## Phase P7 — Moderated catalog and provider integrations

- Community API/catalog/upload/approval/moderation, R2 signed storage, takedown flow. OP.GG authorized stats link/plugin; AI/TTS opt-in and provider terms.
- Proper creator license, abuse checks and privacy. No commercial marketplace until content and seller rights cleared.
- Exit: malicious upload denied, takedown works, no private auth data leaks and service degrades gracefully.

## Phase P8 — Commercial packaging/entitlements

- Payment MoR evaluation, creator ownership/legal counsel, free tier, premium SKU feature mapping, signed license verification and offline grace.
- Separate signed updater feeds and real installer identities, migration notes and long-term support.
- Exit: payment sandbox purchase/refund/replay test and cross-edition artifact validation; product registered/approved before paid public launch.

## Phase P9 — Hardening and public launch [authorization required]

- Windows native clean-machine end-to-end tests: installed old release → signed new release for each SKU, local vault persisted, Riot launching, approved adapter operations, last good backup restore.
- macOS browse/theme/creator smoke tests; do not claim Windows-only patcher support there.
- Lighthouse-like screenshot inspection (visual QA not benchmark), accessibility, 22 locale scaffolding, performance p95 and crash/restart.
- Website/manuals/legal/credits/support; release gates, changelog, incident runbook and signed distributions.
- Ask explicit permission to publish; never silently deploy, delete Team databases or start commerce.

## Per-phase acceptance handoff

1. Current commit SHA and source baseline changes.
2. Actual source files modified/created (cross-check `FILE_CREATION_MANIFEST.csv`).
3. Tests executed and exact results; if no native Windows test, label "not tested".
4. Screenshot/video proof for affected screens and correct platform/mode.
5. New risks and policy approvals (do not "work around" them).
6. Rollback instructions and backup verification.
7. Status of feature matrix rows `implemented/gated/unsupported`.
