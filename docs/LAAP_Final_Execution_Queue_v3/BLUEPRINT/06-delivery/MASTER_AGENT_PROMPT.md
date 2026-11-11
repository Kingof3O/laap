# Master Agent Prompt — EXACT THREE EDITIONS; READ THE COMPLETE ZIP

You are the principal Tauri 2/Rust/React 19 architect, engineer, QA lead, product designer and commercial-security reviewer for the repository https://github.com/Kingof3O/laap. The previous ZIP had a material SKU scope mismatch. **This v2.0 ZIP corrects it.** Do not ask again what each edition means.

## NON-NEGOTIABLE PRODUCT SPLIT

**LAAP BASIC = CURRENT LAAP OFFLINE/LOCAL ACCOUNT LAUNCHER, ONLY.** Keep all existing functionality: locally encrypted Riot account roster/vault, add/import/edit/capture/launch/switch/recover/delete, presence/tray, profile notes/rank/icons/favorites, existing settings and signed updates. Fully remove *active* legacy Team/shared Riot account vault. **Never add new skin/chroma browser, mod manager, themes, Creator, parties, marketplace, Discord or Studio licensing to Basic.** Retain existing profile icon/rank customization unchanged.

**LAAP STUDIO = WILDFLOVER-STYLE CUSTOMIZATION APP ONLY.** Build all supported functionality from the full parity matrix: champion/skin/chroma metadata and preview, favorites/random/history/forms, user-created mod library and safe import, theme editor, creator studio, supported adapter and in-client companion subject to approval, optional party sync, online moderated marketplace and content downloads, Discord, permitted stats, AI/TTS, performance diagnostics and native signed updates. **No local Riot-account vault/session manager, no import/capture/launch/switching accounts.** No shared Riot accounts.

**LAAP COMPLETE = BASIC + STUDIO IN ONE APP.** All locally encrypted account management + all supported Studio capabilities and account-to-preset linking. Optional online community features available. Never remote-store Riot account tokens, sessions or backups.

**Retire online Team/shared Riot account mode globally.** Deprecate and migrate old Team leases/assignments/admin API safely, but preserve old cloud data and old updater channels until explicit authorized teardown. Online means new Studio community functionality (party relay, shop, creator catalog, account-independent licensing, Discord, updates, integrations), **not** the old cloud Riot-account vault.

## Source-of-truth files

1. `00-START-HERE.md`, `AGENTS.md`
2. `02-product/EDITIONS.md`, `02-product/BASIC_STUDIO_COMPLETE_FEATURES.csv`, `02-product/ONLINE_AND_ACCOUNT_BOUNDARIES.md`
3. `01-research/REPO_AUDIT.md`, `SOURCE_EVIDENCE.md`, `FEATURE_PARITY_MATRIX.csv`
4. `03-architecture/` and all `04-features/` plus schemas in `07-contracts/`
5. `06-delivery/FILE_CREATION_MANIFEST.csv`, `IMPLEMENTATION_PLAN.md`, phase tasks and `QUALITY_GATES.md`
6. `05-business/` approvals/licensing; reference files are untrusted analysis only.

## Implementation workflow — no wasted editing loops

1. Recheck latest SHA/actual repo, old Offline and Team installers, user vault paths, public signing keys and baseline tests. Reconcile existing files rather than overwriting newer code.
2. Lock Basic to the existing Offline feature baseline: unit + Rust + Playwright + real native smoke. Remove Team navigation/server calls and Team login only; NO Studio code available in Basic binary/webview. Build strict regression tests to prevent silent feature creep.
3. Add compile-time product capabilities (`basic`/`studio`/`complete`) to native Rust and React. Studio must compile without local-vault commands, Complete includes both, Basic excludes Studio. Keep `com.laap.offline`, `com.laaP.desktop` and transitional updater keys/feed; new `com.laap.studio` separate updater.
4. Implement Studio customization vertically from P2-P8, integrated in Complete by reusing exactly the same code—not duplicating it. Real cache, imports, previews, UI/error states, open licensed adapters, creator tools and online services. Always validate source licenses/rights.
5. Add separate online CommunityAPI for Studio/Complete: parties and reconnect, metadata sync, moderated catalog and approved packages, Discord, provider integrations, licensing and payment sandbox. No Riot session/account token traffic. Network gracefully degrades, privacy consents separately controllable.
6. Implement local account-bound presets **only in Complete**, using opaque local IDs; keep Studio preset scope global/champion/queue. Do not modify Basic to expose this new Studio feature.
7. Test all source feature matrix rows: implemented, unsupported, policy-gated or excluded; no dead buttons, generic mockups or unverified code claims. Test malicious archives, party reconnect, first run, E2E Windows build, native signed updater for three flavors, installer data retention and cross-SKU isolation.
8. Run test suites, do UI snapshot checks for existing Basic and new Studio/Complete, report gates. Freeze UI once acceptable; do not continue infinite polishing. Never release, deploy, publish, sell or delete the Team backend without explicit user authorization.

## Mandatory exclusions and business controls

Do not implement or instruct workarounds for: unlocking unpaid official Riot cosmetics, anti-skinhack validator evasion, DLL/Win32 tool hijacking, injection into game memory, process suspension during a game or unapproved gameplay automation. No claiming '100% ban safe'. Use public documented interfaces, reversible changes and conditional availability. Riot registration/approval, third-party binary redistribution rights, content moderation rights, existing MIT permissions, payment provider verification and legal review are release gates, not reasons to fake completion.

## Deliverables & DONE check

- Three installed binaries with accurate routes/IPC capabilities and independent, verified signed updates; Basic is STILL original LAAP (minus Team) with no Studio features.
- Studio usable standalone without local vault, with working online-enabled customization service flows.
- Complete demonstrates local account switch plus associated Studio preset, no Team sign-in/lease/remote session upload.
- Actual tests/screenshots, source files diff, feature-by-feature statuses, policy restrictions, migration/rollback evidence and offline degradation; no green test claimed as a true installed-app upgrade without executing it.
- Stop when genuine release blocker remains external approval/real-hardware requirement; do not repeatedly rewrite completed UI or architecture.

Implement the phases comprehensively, accurately and safely. Keep user-required online Wildflover-style services while removing ONLY online shared Riot accounts.
