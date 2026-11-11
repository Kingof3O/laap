# LAAP Basic · Studio · Complete — Final Corrected Agent Blueprint

**Plan version:** 2.0 · **Decision date:** 2026-11-10 · **Source repo:** https://github.com/Kingof3O/laap · **Audited baseline:** `6d4475bfd70cc12a063ddf7eac7d07b11f079f28` (agent recheck latest main).

## The three products — authoritative

1. **LAAP Basic:** the **current existing LAAP Offline/local-account product ONLY**. Preserve encrypted Riot local-account vault, one-click account switching, icons/ranks/notes/favorites, launcher and Presence, tray and signed updater; remove Team/shared-account code. Do **not** add the Wildflover catalog, skin browser, custom mods, theme editor, creator workshop, party, community shop or paid modules to Basic. Existing icon/rank profile customization is part of current LAAP and stays.
2. **LAAP Studio:** the **Wildflover-style standalone customization suite**, improved with Rose-style selection concepts, performant Rust backend, mod workshop, themes, presets, parties, optional supported in-client companion, community/creator services and professional tools. **No saved Riot account sessions, no account switching, no vault**. Account observation for cosmetics must never become a second vault.
3. **LAAP Complete:** exactly **LAAP Basic + LAAP Studio** integrated in one app. Saved local Riot accounts can have linked Studio customization presets, without any online shared-account storage.

**Online vs online accounts:** all Riot accounts are stored locally and never pooled/shared. Studio/Complete can still access optional internet services: room/party relay, remote catalog, community mod downloads, hosted creator profiles, Discord, provider-authorized stats, opt-in AI/TTS, entitlements and secure updates. Basic retains its existing update/optional Riot data functionality, not new Studio services. Local-account storage ≠ forced network isolation.

## Read order

1. `00-START-HERE.md` — non-overridable business/product split.
2. `AGENTS.md` — implementation/quality boundaries.
3. `02-product/EDITIONS.md` + `02-product/BASIC_STUDIO_COMPLETE_FEATURES.csv` — SKU entitlement and feature visibility.
4. `01-research/REPO_AUDIT.md`, `SOURCE_EVIDENCE.md`, `FEATURE_PARITY_MATRIX.csv` — what exists and 131 sourced feature rows.
5. `03-architecture/` + `07-contracts/` — shared code, data safety and online-service boundaries.
6. `04-features/` — complete supported customization functional specs.
7. `05-business/` — commercial, third-party and Riot release gates.
8. `06-delivery/MASTER_AGENT_PROMPT.md`, `IMPLEMENTATION_PLAN.md`, `FILE_CREATION_MANIFEST.csv`, `QUALITY_GATES.md`, tasks, skills — execution and acceptance.
9. `reference/wildflover-analysis/` — exact nine original user dossier documents; reference only, never run unknown binaries.

## Source and truth

This is a detailed blueprint, not an implemented app or legal approval. Every sourced Wildflover/Rose function is tracked as `IMPLEMENT_OR_ADAPT`, `CONDITIONAL_REDESIGN`, or exclusion, with exact product applicability in the feature CSV. The user-provided reverse engineering is valuable but is not an independent security or licensing audit.

## Core constraints

- Zero shared-account Team/online vault behavior in any of the three products; do not delete remote customer data without approval.
- **Basic feature freeze** except necessary retire/migration/security/compatibility work; run strict before-vs-after regression checks.
- Studio/Complete functionality must be real and complete within supported policy/legal/platform limits; no UI-only phantom features.
- One shared Tauri 2 / Rust / React 19 codebase with capability-aware compile/bundle and independent signed release streams.
- No Wildflover proprietary DLL/process hijacking, no official paid-skin piracy, no LTK protection bypass, no game memory modifications, no forced game suspension.
- Online commerce/marketplace/party never handles Riot sessions. Sensitive operations opt-in; cached local content functions with poor connectivity.
- Retain Velvet Amethyst theme: dark violet `#100D19`, `#241D34`, `#392D4C`, accent `#C9A6FF`, text `#F8F2FF`.
- Do not sell before relevant Riot registration/approval and legal/merchant/asset rights review. Existing MIT-licensed LAAP versions remain MIT-permitted.
