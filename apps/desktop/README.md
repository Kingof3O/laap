# LAAP Desktop

Tauri v2 + Rust backend with a React/TypeScript frontend. Checked against v0.4.3 source on 2026-10-14.

## Current interface

![Personal Roster with saved avatar, rank, notes, and sorting](../../docs/assets/launcher-grid.png)

![Live profile editor](../../docs/assets/profile-editor.png)

![Compact roster list](../../docs/assets/launcher-table.png)

Screenshots use a test-only native IPC fixture. Production code never supplies demo accounts when IPC is missing.

## Features

Personal Roster supports Add/Edit, favorites, notes, grouped regions, complete ranks, competitive rank/name/time sorting, and grid/list views. Play serializes Stop → session injection → Riot launch → last-played update. Stop Riot preserves saved logins. A live League/Valorant game process requires confirmation before stopping or switching. Sign in again refreshes an existing session while preserving profile metadata.

Choose local PNG/JPEG/WebP uploads or explicit Data Dragon downloads. Icons are cached as local files; rank crests are bundled. Optional icon and Solo/Duo rank sync are independent, disabled by default, and require a matching saved PUUID. See [profile customization](../../docs/profile-customization.md).

Team Edition adds LAAP authentication and Shared Accounts leases. Offline Edition hides those views and disables cloud API/update polling. Its webview blocks network connections; narrow native commands still support explicit icon downloads and opted-in loopback League Client sync.

## Development

From the repository root:

```sh
npm ci
npx --workspace @laap/desktop tauri dev
```

`npm --workspace @laap/desktop run dev` runs Vite alone. Browser previews cannot load the real native roster. See [DEVELOPMENT.md](../../docs/DEVELOPMENT.md) for Offline dev mode, platform requirements, tests, and native packaging.

## Native command map

The authoritative handler list is `src-tauri/src/lib.rs`; DTOs are in `local_store/models.rs`. Frontend invoke arguments use camelCase keys.

| Commands | Purpose |
|:---|:---|
| `list_local_accounts`, `get_local_account` | Local summaries/full profile |
| `save_local_account`, `edit_local_account`, `delete_local_account` | Create/edit/delete; save accepts rank, notes, favorite, customization |
| `launch_local_account(id, confirmed?)` | Guarded native launch |
| `refresh_local_account(id, session_blob)` | In-place session refresh |
| `detect_active_profile`, `capture_active_session` | Local detection for reviewed import |
| `start_provisioning_session(confirmed?)` | Returns an owned provisioning ID |
| `poll_provisioning_session(provisioning_id?)` | Reads captured session for the owned sandbox |
| `cancel_provisioning_session`, `finish_provisioning_session` | Restore settings; accept provisioning ID and optional match confirmation |
| `complete_local_provisioning` | Complete save/refresh and restore provisioning state |
| `runtime_snapshot`, `close_riot_client` | Detect clients/games and stop with optional confirmation |
| `switch_account_session`, `inject_account_session`, `cleanup_account_session` | Managed shared-session orchestration |
| `recover_orphaned_account_session` | Recover a managed backup when safe |
| `get_icon_catalog`, `get_profile_icon`, `read_cached_icon`, `upload_profile_icon` | Explicit asset download/cache/upload |
| `sync_profile_customizations` | Read opted-in matching League Client customization |
| `device_public_key`, `sign_device_nonce`, `device_platform`, `device_info` | Device identity |
| `load_access_token`, `store_access_token`, `clear_access_token` | Native LAAP bearer-token persistence |
| `open_external_url` | Validated external browser opening |

`edit_local_account` returns unit on success, not a summary. Callers should refetch summaries after edits. See handler signatures before adding clients rather than relying on this grouped reference as a full schema.

## Storage and platforms

| Location | Windows | macOS |
|:---|:---|:---|
| Local vault | `%APPDATA%/LAAP/laap_local_accounts.json` | `~/Library/Application Support/LAAP/laap_local_accounts.json` |
| Image cache | `profile-assets` under vault directory | `profile-assets` under vault directory |
| Riot settings | `%LOCALAPPDATA%/Riot Games/Riot Client/Data` | `~/Library/Application Support/Riot Games/Riot Client/Data` |
| Vault key / device private key | Windows Credential Manager | macOS Keychain |

Session blobs are AES-256-GCM encrypted. Metadata and cached PNGs are readable local files. The store uses locked JSON transactions, atomic writes, and damaged-record quarantine. See [security model](../../docs/SECURITY_MODEL.md) and [verification limits](../../docs/desktop-hardening-verification.md).
