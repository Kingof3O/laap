**SKU correction:** Existing LAAP `tauri.offline.conf.json` is the future **Basic** product, with no new Wildflover/Rose functionality. Future **Studio** adds customization only, and **Complete** combines Studio with existing local accounts while retiring shared Team. Cloud Team assets are migration-only. The repository audit snapshot is not evidence that planned Studio functions already exist.

# Grounded Audit — Current LAAP Repository

**Remote:** https://github.com/Kingof3O/laap  
**Branch/SHA inspected:** `main` / `6d4475bfd70cc12a063ddf7eac7d07b11f079f28` on 2026-11-10. **Revalidate before writing.**

## Actual workspace

| Area | Confirmed location | Present responsibility | Plan |
|---|---|---|---|
| Tauri/Rust desktop | `apps/desktop/src-tauri/` | Native commands, tray, presence, account vault, Riot lifecycle, signed updater | Keep and modularize; add customization modules and SKU build config |
| React 19 frontend | `apps/desktop/src/` | Local roster, Team vault, settings, UI, updater | Keep UI foundation; replace Team pages with new navigation |
| API service | `apps/api/` | Cloud accounts, auth, leases, devices, assignments | Retire shared-account API; preserve migration read/export temporarily; rebuild **new** optional service with strict independent purpose |
| Admin frontend | `apps/admin/` | Team accounts, assignments, admin dashboards | Deprecate Team admin; create new creator/moderation/commerce console in separate package if cloud features enabled |
| Shared TS | `packages/types`, `packages/validation` | Account and cloud lease schemas | Separate `local`, `customization`, `party`, `commerce`; migration compatibility only for legacy types |
| Supabase | `supabase/migrations/` | Team-oriented account and lease tables | Do NOT drop before backup/export/revocation; new service schema should not contain Riot session material |
| Release signing | `.github/workflows/`, `.signpath/`, `scripts/generate-update-manifest.mjs` | Multi-edition signed Windows/macOS release | Extend securely to new flavor; keep old updater keys and bootstrap paths |

## Existing local vault architecture — DO NOT BREAK

- `apps/desktop/src-tauri/src/local_store/storage.rs`: `laap_local_accounts.json`; atomic save and quarantine of corrupt data.
- `apps/desktop/src-tauri/src/local_store/crypto.rs`: AES-256-GCM with randomly generated OS keychain key; session blob is sensitive.
- `apps/desktop/src-tauri/src/local_store/models.rs`: `LocalAccount` with id/name/region/rank/notes/favorite/puuid/session timestamps/customization/session blob.
- `apps/desktop/src-tauri/src/commands/local_accounts.rs`: list/get/save/edit/delete/refresh/launch; do not reinterpret the commands as cloud accounts.
- `apps/desktop/src-tauri/src/riot/operation.rs`, `process.rs`, `session_manager.rs`: native session/launch/provisioning guards and recovery.
- `apps/desktop/src-tauri/src/profile_assets.rs`: Data Dragon profile icon caching, read-only LCU and optional rank/icon sync. Reuse patterns but isolate from heavy custom media caches.
- `apps/desktop/src/features/personal-roster/`: existing local-account UX and refresh; preserve.

## Current shared-account architecture scheduled for retirement

- `apps/desktop/src/features/team-vault/*`: Team vault, cloud leases and session upload paths.
- `apps/desktop/src/features/auth/*` and `device/*`: Team sign-in/device registration.
- `apps/api/src/routes/accounts.routes.ts`, `leases.routes.ts`, `auth.routes.ts`, `devices.routes.ts`, `admin.routes.ts`.
- `apps/admin/src/pages/*`: shared-team administration.
- `packages/types/src/index.ts`: AccountSession, lease, role, dashboard schemas.
- `supabase/migrations/*`: Team lease/account schema.

**Retirement ≠ deletion in first commit**. Add read-only export and migration UI, carefully release leases and redact/delete cached tokens before removing production paths. Verify server owners and user access before sunsetting services.

## Current desktop editions

- `apps/desktop/src-tauri/tauri.conf.json`: Team product `com.laaP.desktop`, v1.0.0 source; endpoint `latest-team.json`.
- `apps/desktop/src-tauri/tauri.offline.conf.json`: Offline product `com.laap.offline`, v1.0.0 source; endpoint `latest-offline.json`.
- Offline frontend uses `vite --mode offline` / `IS_OFFLINE_ONLY`; browser CSP `connect-src 'none'`; native update requests still use network.
- Current published release may differ from source version; verify version/channel before migration.

## Concrete architecture recommendation

1. **Do not reuse Team’s database or cloud API as the new trusted vault**. No Riot token/session upload to marketplace/party.
2. Add a versioned **customization preferences and content library store** separate from encrypted session envelopes, keyed optionally by local account ID using safe reference-only foreign keys.
3. Introduce independently switchable components (`catalog`, `themes`, `mods`, `presets`, `creator`, `party`, `marketplace`, `integrations`) with clear capabilities and platform support.
4. Add new `apps/community-api` / `apps/community-admin` only after online feature approval; keep local features deployable without them.
5. Build a stand-alone Studio without `local_store` command capabilities; hiding tabs is not sufficient isolation.
6. Make macOS support truthful. LTK Manager currently advertises Windows 10/11; macOS should browse/create without claiming live patcher support.

## Known documentation conflicts to correct

- Root README currently states **"100% Anti-Cheat Safe (Zero Ban Risk)"**. This cannot be guaranteed even for current account tools and especially not with modding. Replace with measured capability statements and a risk disclosure.
- Root README calls the Offline edition "100% Offline" yet it supports optional Data Dragon and native GitHub updates. Clearly distinguish **offline accounts** from **no network ever**.
- Team shared-account workflows distribute Riot session material between users; confirm any compliance obligations before migrating or retiring.

## Recommended integration points

- `App.tsx`: replace `appMode: 'local'|'team'` with stable navigation + flavor capabilities, not a boolean web of flags.
- `RiotOperations.tsx`: share native operation lock with mod apply, themes and updater; never launch while an unsafe operation is in progress.
- `launcher_settings.rs`: add settings version/migration with explicit domain sections rather than a giant settings struct.
- `lib.rs`: register a small set of per-domain invoke commands and enforce compile-time capabilities.
- `profile_assets.rs`: share only validated image helpers/data fetch patterns; avoid coupling catalog cache to local vault encryption.
- `useUpdateChecker.ts`: preserve signed updater with distinct product/edition-specific manifests and identity; migration-compatible old feeds.

## Scope confidence

Read directly: repo tree, README/LICENSE, core modules, package config, Rust capabilities, current API routes, store models, build configs. NOT executed: live League client, Windows LTK/Pengu loader, actual native installer. Agent must perform these tests later.
