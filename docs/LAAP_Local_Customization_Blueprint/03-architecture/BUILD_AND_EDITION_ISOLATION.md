# Three Flavor Build Contract — Hard Product Isolation

## Native build-time cap definitions

- `BASIC = VAULT + LOCAL_LAUNCH + EXISTING_PRESENCE + EXISTING_UPDATER`; no new Studio Rust services registered, no Studio assets bundled, no community SDK.
- `STUDIO = CUSTOMIZATION + CREATOR + THEMES + MOD_MANAGER + GAMEFLOW_READ_ONLY + OPTIONAL_SERVICES + STUDIO_UPDATER`; `VAULT=false`, `LOCAL_LAUNCH=false` and no native capture/provision/Riot account switch commands.
- `COMPLETE = BASIC + STUDIO + ACCOUNT_PRESET_BINDING`; never `TEAM_SHARED_VAULT`.

Frontend TypeScript checks are necessary but not sufficient: enforce Rust command registration boundaries, packaging audits, bundled JS import graph and native command negative tests. A hidden menu is NOT a security boundary.

## Existing build identity

- Source `tauri.offline.conf.json` is Basic even if internal historical name is `offline`. Avoid renaming config in a way that rekeys OS keychain or app storage. Build flavor string `basic` is a user-facing product name, not a claim that Riot multiplayer works offline.
- Source `tauri.conf.json` old `com.laaP.desktop` is Complete migration target. Existing Team users need a migration-safe signed update using their original updater endpoint. Remove Team auth/leases in new runtime. A license upgrade must not secretly prevent existing customers from accessing local profiles.
- New `tauri.studio.conf.json`: unique ID, all old vault IPC absent, new per-product updater endpoint, no default elevation.

## Required build tests

1. Basic UI screenshots match current Offline baseline except requested Team removal/branding. Basic source bundle lacks Studio routes. Basic Rust command manifest disallows `customization_*`, `party_*`, `marketplace_*` and all Team RPCs.
2. Studio does not include `get_local_account`, `save_local_account`, `launch_local_account`, `capture_active_session`, `switch_account_session`, `inject_account_session`; no local vault filesystem or keyring access from Studio.
3. Complete includes every existing Basic local-account command plus supported Studio modules. Tests prove preset binding uses opaque ID, no session bytes.
4. All three independent installers and signed manifests check `edition`, platform, product ID, signature, new-vs-existing version. Install tests preserve local vault and content assets.
5. Existing Basic and former Team/Complete user data and update channels remain valid. No old Team network login remains in active app.
