# LAAP Desktop V2

Tauri v2 + Rust backend with a modern React 19 / TypeScript interface.

## V2 Interface & Architecture

LAAP V2 introduces a complete desktop redesign:
- **Design system:** Semantic tokens in `src/styles/tokens.css` with dark-first Hextech aesthetics (`#070D17` canvas, `#101B2C` surfaces, `#C8AA6E` gold accents).
- **Custom Titlebar:** `WindowTitleBar.tsx` on Windows with frameless titlebar drag and window control IPC (`window_minimize`, `window_toggle_maximize`, `window_close`).
- **Unified Roster:** Direct single-account representation in responsive grid (`AccountCard.tsx`) and table (`AccountListTable.tsx`) layouts. Redundant hero panel completely eliminated.
- **Contextual Actions:** Clean context menus (`ContextMenu.tsx`) preventing scattered icon buttons on cards.
- **Two-Column Settings:** Spacious workspace (`SettingsModal.tsx` + `settings/*`) with modular navigation rail.
- **Native Update System:** Native command `check_github_update` bypassing webview CSP in Offline Edition without compromising isolation.

## Features

Personal Roster supports Add/Edit, favorites, notes, grouped regions, complete ranks, competitive rank/name/time sorting, and grid/list views. Play serializes Stop → session injection → Riot launch → last-played update. Stop Riot preserves saved logins. A live League/Valorant game process requires confirmation before stopping or switching. Sign in again refreshes an existing session while preserving profile metadata.

Choose local PNG/JPEG/WebP uploads or explicit Data Dragon downloads. Icons are cached as local files; rank crests are bundled. Optional icon and Solo/Duo rank sync are independent, disabled by default, and require a matching saved PUUID. See [profile customization](../../docs/profile-customization.md).

Team Edition adds LAAP authentication and Shared Accounts leases. Offline Edition hides those views and disables cloud API polling. Its webview blocks network connections (`connect-src 'none'`); native host commands support explicit icon downloads, local League Client sync, and GitHub update checks.

## Development

From the repository root:

```sh
# Team Edition (Native Desktop)
npm --workspace @laap/desktop run tauri dev

# Offline Edition (Native Desktop)
npm --workspace @laap/desktop run tauri:offline

# Team Edition (Browser UI Preview)
npm --workspace @laap/desktop run dev

# Offline Edition (Browser UI Preview)
npm --workspace @laap/desktop run dev:offline
```

`npm --workspace @laap/desktop run dev` and `dev:offline` run Vite alone. Browser previews show an explicit missing-IPC notice. See [DEVELOPMENT.md](../../docs/DEVELOPMENT.md) for platform requirements, tests, and native packaging.

## Testing & Verification

```sh
# Typecheck & Vite builds
npm --workspace @laap/desktop run build
npm --workspace @laap/desktop run build:offline

# Unit test suites
npm --workspace @laap/desktop run test:sorting
npm --workspace @laap/desktop run test:lease-exit
npm --workspace @laap/desktop run test:updater

# Full Playwright UI integration suite (19 tests)
npm --workspace @laap/desktop run test:ui
```

## Native Command Map

The authoritative handler list is `src-tauri/src/lib.rs`. Frontend invoke arguments use camelCase keys.

| Commands                                                                          | Purpose                                                                  |
| :-------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| `window_minimize`, `window_toggle_maximize`, `window_is_maximized`, `window_close`| Custom frameless titlebar window controls                                |
| `get_app_version`, `check_github_update`                                          | Dynamic version query and native GitHub update verification              |
| `list_local_accounts`, `get_local_account`                                        | Local summaries/full profile                                             |
| `save_local_account`, `edit_local_account`, `delete_local_account`                | Create/edit/delete; save accepts rank, notes, favorite, customization    |
| `launch_local_account(id, confirmed?)`                                            | Guarded native launch                                                    |
| `refresh_local_account(id, session_blob)`                                         | In-place session refresh                                                 |
| `detect_active_profile`, `capture_active_session`                                 | Local detection for reviewed import                                      |
| `start_provisioning_session(confirmed?)`                                          | Returns an owned provisioning ID                                         |
| `poll_provisioning_session(provisioning_id?)`                                     | Reads captured session for the owned sandbox                             |
| `cancel_provisioning_session`, `finish_provisioning_session`                      | Restore settings; accept provisioning ID and optional match confirmation |
| `complete_local_provisioning`                                                     | Complete save/refresh and restore provisioning state                     |
| `runtime_snapshot`, `close_riot_client`                                           | Detect clients/games and stop with optional confirmation                 |
| `switch_account_session`, `inject_account_session`, `cleanup_account_session`     | Managed shared-session orchestration                                     |
| `recover_orphaned_account_session`                                                | Recover a managed backup when safe                                       |
| `get_icon_catalog`, `get_profile_icon`, `read_cached_icon`, `upload_profile_icon` | Explicit asset download/cache/upload                                     |
| `sync_profile_customizations`                                                     | Read opted-in matching League Client customization                       |
| `device_public_key`, `sign_device_nonce`, `device_platform`, `device_info`        | Device identity                                                          |
| `load_access_token`, `store_access_token`, `clear_access_token`                   | Native LAAP bearer-token persistence                                     |
| `open_external_url`                                                               | Validated external browser opening                                       |
