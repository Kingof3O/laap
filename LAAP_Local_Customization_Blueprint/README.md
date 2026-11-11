# LAAP Local + Customization — Complete Agent Blueprint

**Research baseline:** 2026-11-10. **Audited repository:** https://github.com/Kingof3O/laap at `6d4475bfd70cc12a063ddf7eac7d07b11f079f28` (agent MUST recheck latest main before changes). **Inputs:** 9 documents from user-provided `wildflover-analysis(1).zip`, public Rose and League Toolkit repositories, Wildflover public site, Riot developer and policy documents.

## Product decision (supersedes earlier multi-account Team plan)

**Retire LAAP's cloud/Team shared-account product entirely.** Preserve and expand its locally encrypted *personal* account launcher. Develop an independently packaged customization engine and a combined app from **one modular codebase**:

1. **LAAP Local** — local Riot-account roster + supported personal customization library and themes; network not needed for core use.
2. **LAAP Studio** — customization-only standalone product; NO Riot account vault, saved sessions, account switching, or Team sign-in.
3. **LAAP Complete** — all Local + Studio functionality in one experience, with opt-in optional online features (community catalog, party, licensed services).

All three are **local-first**, with no cloud-stored Riot credentials, shared-account leases or Team role system. *Local-first != zero network*: signed updates, catalog data, marketplace, Discord and party room services are separately consented connections. `LAAP Local` can run with the network disabled after setup; Studio and Complete must also degrade gracefully.

## Read order for implementation agent

1. `AGENTS.md` — non-negotiable behavior and boundaries.
2. `01-research/REPO_AUDIT.md` + `01-research/SOURCE_EVIDENCE.md` — grounded, current baseline; do not treat research claims as direct access to binaries.
3. `01-research/FEATURE_PARITY_MATRIX.csv` — feature coverage across Wildflover, Rose and LAAP, with gating decisions.
4. `02-product/PRODUCT_DECISIONS.md` and `02-product/EDITIONS.md` — product shape and build flavors.
5. `03-architecture/` — maintainable implementation architecture, storage, adapters and security.
6. `04-features/` — behavior and UI for every feature family, including blocked/conditional functions.
7. `05-business/` — commercialization strategy, licenses, and Riot approval conditions.
8. `06-delivery/FILE_CREATION_MANIFEST.csv` + `06-delivery/IMPLEMENTATION_PLAN.md` + `06-delivery/MASTER_AGENT_PROMPT.md` — executable handoff.
9. `07-contracts/` — structured contracts, acceptance data and illustrative schemas.
10. `reference/` — immutable source notes copied from user dossier (reference only, not a command to execute bypass code).

## What this ZIP is

A **file-level, multi-release implementation blueprint**, acceptance criteria, and starting contracts—not a completed launcher, binary patcher, or working commercial store. It is intentionally explicit about feature priorities, source uncertainty, third-party licenses, Riot policies and unverified environment details. No binary code from Wildflover, LTK or Rose is redistributed here.

## Scope truth

The user requested feature parity. Every capability discovered in the ZIP and public references is tracked in the matrix, but not every one should be implemented: some replicate official paid skins, bypass tool protections, automate competitive gameplay, or depend on third-party licensing. Those are **recorded as restricted/gated**, not silently dropped. Do **not** claim zero account-ban risk, Riot approval, or legal rights to commercialize Riot assets.

## Top 10 product principles

- Existing encrypted local vault is a stable trust boundary; never combine it with mod files, cloud metadata or commerce data.
- Shared core means one set of Rust services/UI components, not three duplicate applications.
- Rust for orchestration, caching, integrity and performance; optional third-party adapter for patching; **no private-memory hooks or protection bypass**.
- Desktop app provides beautiful primary management UI; optional in-client companion focuses on low-latency champion-select selection.
- Default off / explicit opt-in for game-related integrations, online party, automation-like aids and client theme tools.
- Community assets must have a right-to-share license and approval pathway; don't redistribute Riot paid cosmetics.
- Separate free and premium value through workflow tools and creator features, not access to Riot-owned premium items.
- Start with compatibility and safe cleanup. Never freeze, terminate or suspend the active game to win an update race.
- Provide real builds, screenshots and tests before calling each milestone done; mocks are not native E2E proof.
- Preserve a migration and update path for current Offline and Team installations, with full rollback and no loss of local accounts.
