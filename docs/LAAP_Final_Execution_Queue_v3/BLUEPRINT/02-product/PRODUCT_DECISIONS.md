# Product Decision Record — CONFIRMED BASIC, STUDIO, COMPLETE

## Final user decision (2026-11-10)

1. **Basic = current LAAP Offline/local account launcher, feature-for-feature.** Nothing from Wildflover/Rose added to Basic beyond existing profile icon/rank options. Remove online Team/shared Riot-account mode everywhere.
2. **Studio = Wildflover-style dedicated customization app** with all supported feature families, enhanced via Rose's in-client UX ideas, modular Rust processing and performance, and optional online party/shop/social/provider services. Zero account vault/session switching.
3. **Complete = Basic + Studio**, in one application with per-local-account preset assignment. Online community services on, online shared Riot-account vault off.

Do not rename Basic to Local or add Studio functions to it. A flavor's compiled capability contract is authoritative over user interface labels, feature plans and commerce tiers.

## Installer identity and migration

- Basic: preserve `com.laap.offline` + `latest-offline.json`, vault file and OS-keychain identity.
- Studio: new `com.laap.studio` + `latest-studio.json`, separate local mod/theme/library store; no vault.
- Complete: preserve `com.laaP.desktop` initially + legacy signed `latest-team.json` channel, but remove Team functions after explicit authorized safe data transition. Add `latest-complete.json` only after tested old-to-new bridge.
- `apps/api` / `apps/admin` and Supabase Team records remain migration-only while active accounts are retired. Cloud destruction requires explicit separate approval.

## UI navigation by edition

| Basic | Studio | Complete |
|---|---|---|
| Existing local account roster | Discover/champion skins/chromas | Local account roster + Studio workspace |
| Existing profile inspector, ranks, icons, notes | My Mods / imports/updates/repair | Account-linked customization presets |
| Existing Presence / launch / tray / settings / updater | Client Themes / Creator / Party | Discover / My Mods / Client Themes / Creator |
| **NO** shop, mods, skin browser, parties, creator | Marketplace / Friends / Integrations / Settings | Party / Marketplace / Friends / Integrations / Settings |

## Cloud meaning

**Riot account storage**: always local-only, no shared pool, no leased account tokens, no session blob cloud uploads. **Internet services**: optional party rooms, approved community downloads, catalog/preview sources, moderated creator content, Discord, authorized stats, AI/TTS, secure updater and license checks for Studio/Complete. Keep privacy/consent controls and graceful offline handling. Basic's existing updater and opt-in icon/rank sync stay, but no Studio networking.

## Studio feature breadth and restrictions

Maintain all 131 tracked source feature rows, not identical risky implementations. Native Rust studio processes imports, previews, conflict detection, content-addressed cache, compatible mod workspaces, theme editing and backups. Optional LTK/Pengu adapters via documented interfaces only. In-client UI/gameplay modifications require platform, technical, license and Riot-policy clearance. Exclude unowned paid-skin unlock, Wildflover DLL hijacking, LTK validator spoofing, memory hooks and auto-gameplay exploits.

## Commercial rationale

Keep Basic free as the existing launcher; charge only for original transformative Studio creator/pro utilities and Complete bundle where Riot and merchant approvals allow. Current public MIT permissions remain intact. Hosted services require actual ongoing moderation/privacy/retention and independent accounts, never Riot credentials. Pricing experiments are hypotheses, not promises.
