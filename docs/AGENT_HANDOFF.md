# Maintenance handoff

Checked against v0.4.3 source on 2026-10-14. This describes repository state; deployment URLs/configuration do not prove current service health.

## Current baseline

v0.4.3 contains profile customization, local cached icons, optional icon/Solo-Duo sync, rank/name/time sorting, guarded Stop/Switch, in-place session refresh, owned provisioning cancellation, and vault concurrency/corruption hardening. GitHub built both editions for Windows x64 and universal macOS. See [release verification](desktop-hardening-verification.md).

The local desktop store is JSON with encrypted session blobs, not SQLite. SQLite belongs to the local API adapter. Profile metadata and PNG caches are local readable files. Missing IPC/API responses must surface loading/errors and never fabricate accounts.

## Key files

- Desktop orchestration: `src/context/RiotOperations.tsx`, native `riot/operation.rs`, and `commands/session.rs`.
- Provisioning ownership: `shared/hooks/useProvisioningSandbox.ts` and native `riot/provisioner.rs`.
- Vault transactions, quarantine, encryption: native `local_store/`.
- Profiles and images: `shared/ui/ProfileFields.tsx`, `IconPicker.tsx`, `RankPicker.tsx`, and native `profile_assets.rs`.
- Native command registration: `apps/desktop/src-tauri/src/lib.rs`.
- API routes and authorization: `apps/api/src/routes/`, with SQLite/Supabase domain services.
- Hosted configuration: root `wrangler.toml`; Pages proxy `apps/admin/public/_worker.js`.

Paths beginning with `src/` above are relative to `apps/desktop/`.

## Maintenance boundaries

- Preserve user profiles, OS-keychain keys, settings backups, and cached images. Never use a real user's vault/session material as test fixtures.
- Session integration is unofficial; avoid Riot-approval, ban-proof, mandatory-signature, or unconditional zero-network claims.
- Optional LCU sync intentionally reads local process arguments/lockfiles. Credentials remain ephemeral and loopback-only; no game-memory inspection or gameplay automation is implemented.
- Live League/Valorant game processes require consent before stop/switch. Do not bypass native guards or ownership locks.
- Offline webview CSP does not block Rust networking: downloads and sync must remain explicit/opted-in.
- Dialogs use React focus traps/Escape handlers; do not rely on WebKit `window.confirm`.
- Recovery checks run every 30 seconds outside active operations; team lease and optional profile sync intervals are 20 seconds. Lease stale timeout is 120 seconds subject to reconnect grace.

## Local development and docs

Use [the development guide](DEVELOPMENT.md) for actual native launch commands. An external macOS volume may generate AppleDouble files; keep Cargo output on a local filesystem using `CARGO_TARGET_DIR=/tmp/laap-desktop-cargo-target`. Do not assume a developer-specific Rust home or cached app path exists.

Keep release versions aligned in root/desktop package manifests and lockfiles, Cargo manifest/lockfile, both Tauri configs, and `useUpdateChecker.ts`. Capture current UI screenshots using test-only fixtures and document their origin; no production fallback arrays.

Production instructions are in [PRODUCTION.md](PRODUCTION.md). Follow user/workspace deployment preservation rules. Do not infer deployment authorization from an outdated handoff note.
