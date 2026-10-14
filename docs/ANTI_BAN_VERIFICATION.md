# Native interaction and verification

Checked against v0.4.5 source on 2026-10-14. The historical filename is retained for existing links. This document does not certify anti-cheat safety or Riot approval.

## What the native core does

- Inspects process names/PIDs through `sysinfo` to detect Riot Client, League Client, League game, and Valorant game processes.
- Requests confirmation before Stop/Switch when a game process is detected. Windows uses WM_CLOSE, then verified termination if needed; Unix uses SIGTERM before termination fallback.
- Backs up, replaces, and restores Riot session settings while client/game processes are stopped. Both `RiotGamesPrivateSettings.yaml` and the legacy `RiotClientPrivateSettings.yaml` are recognized.
- Launches the official client with `--launch-product=league_of_legends` and `--launch-patchline=live`.
- Optionally reads the local League Client API for the current summoner and Solo/Duo ranked stats, using local ephemeral credentials. Identity checks restrict updates to the matching opted-in profile.
- Downloads public icon assets only when requested or required by enabled icon sync, and caches them locally.

The source contains no game-memory inspection, DLL/code injection, gameplay input automation, or game asset modification. Process inspection and termination can involve OS process handles; “zero OpenProcess events” would therefore be an inaccurate verification criterion. Optional synchronization also means LAAP is not necessarily idle after launch.

## Source checkpoints

| Area | Source |
|:---|:---|
| Process detection, match guard, stopping | `apps/desktop/src-tauri/src/riot/process.rs` |
| Session path resolution | `apps/desktop/src-tauri/src/riot/paths.rs` |
| Session backups and restore | `apps/desktop/src-tauri/src/riot/session_manager.rs` |
| Owned provisioning and cancellation | `apps/desktop/src-tauri/src/riot/provisioner.rs` |
| Launch, switch, ownership and recovery | `apps/desktop/src-tauri/src/commands/session.rs` |
| Optional LCU reads and public icon client | `apps/desktop/src-tauri/src/profile_assets.rs` |

## Reproducible checks

```sh
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
npm --workspace @laap/desktop run test:ui
```

Tests cover launch arguments, match guards, cancellation, restore behavior, profile identity checks, and opt-in races. Browser tests simulate native responses; they do not stop a real match.

For manual Windows verification, inspect the native application's process and file activity using a system tracing tool. Expect reads/writes in Riot's data directory and LAAP's vault/cache directory, OS-keychain access, process inspection, official-client launches, and process termination when explicitly requested. For macOS, `sudo fs_usage -w -f filesys laap-desktop-core` can help inspect file activity. File activity is not confined solely to Riot's directory.

Compare network activity with all optional features disabled, an explicit icon download, and each sync option enabled. Offline Edition should not call the cloud API or GitHub updater. Enabled icon sync can contact Data Dragon when the detected icon is not cached; rank sync reads the loopback client.

Real authenticated LCU synchronization, live matches, and elevated Windows Riot shutdown remain manual validation scenarios. See [verification details](desktop-hardening-verification.md) and [security boundaries](SECURITY_MODEL.md).
