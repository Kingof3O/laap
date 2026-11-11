# LAAP Blueprint v2.0 — CONFIRMED PRODUCT CONTRACT

**This document overrides conflicting language in the old v1.0 plan.** The user explicitly chose the following products on November 10, 2026. **Do not modify the product split without a new user decision.**

| Product | Meaning | Local Riot accounts | Wildflover/Rose-style customization | Optional online Wildflover-style services |
|---|---|---|---|---|
| **LAAP Basic** | **Exactly the current local-only LAAP**; preserve existing features; no extra customization modules | **YES** | **NO** (existing profile icon/rank editing is unchanged) | **NO new** party/marketplace/Discord; existing updater, Data Dragon icon/rank traffic and normal Riot login can still use the internet |
| **LAAP Studio** | Full standalone customization experience; no account launcher or Riot vault | **NO** | **YES**, all legally/technically supported modules | **YES**: optional party, approved mod catalog, downloads, creator profiles, Discord, analytics only if consented, license/updater, permitted integrations |
| **LAAP Complete** | **Basic + Studio** in a single application, including local-account-linked presets | **YES** | **YES** | **YES**, same services as Studio |

**RETIRE** online cloud Team/shared Riot accounts, admin assignments, account-device leases, remote session blob upload/download and their dashboard as active product features. Retain migration-only code/backups until safe retirement and explicit decommission authorization. **Online functionality is NOT retired**: app update feeds, remote catalog/marketplace, user-created mod downloads, party relay, Discord/OP.GG and licensed AI/TTS can be available in **Studio and Complete**, with privacy, service availability and policy/rights controls. Cloud services MUST NOT store Riot account credentials or session blobs.

**Key preservation:** `com.laap.offline` remains Basic app identity (existing offline build); `com.laaP.desktop` remains transitional Complete identity for existing Team installations, and its `latest-team.json` updater feed must continue while migrating. `com.laap.studio` is new. Preserve user vaults and updater-signing trust.

**Not a promise to enable official paid-skin unlocks:** parity requirements are traced in CSV but invasive bypasses/skin piracy are EXCLUDED, and allowed external integrations are policy-, platform- and license-gated. Riot product registration and sale approval are required before a paid public launch.

**Agent start:** Read `AGENTS.md`, `02-product/EDITIONS.md`, `02-product/BASIC_STUDIO_COMPLETE_FEATURES.csv`, `06-delivery/MASTER_AGENT_PROMPT.md`, then all other docs. Do NOT re-ask which editions the user wants.
