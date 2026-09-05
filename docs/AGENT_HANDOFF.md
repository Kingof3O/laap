# LAAP Agent Handoff & Maintenance Guide

This document is the operational guide for future AI coding agents and human developers maintaining the LAAP codebase.

---

## 1. Repository & Workspace Context

- **Workspace Path:** `/Volumes/Shared/PW/laap`
- **Active Branch:** `main`
- **GitHub Remote:** `https://github.com/Kingof3O/laap.git`
- **Operating System:** macOS (Apple Silicon / aarch64)

### Important macOS / Shared Volume Note:
Because `/Volumes/Shared` is a shared network/external volume, macOS creates AppleDouble hidden metadata files (`._*`).
- **Never** commit `._*` files to Git.
- Always use the provided temporary native Cargo target and home paths when running Cargo commands:
  ```bash
  export RUSTUP_HOME=/Volumes/Shared/PW/laap/.toolchains/rustup
  export CARGO_HOME=/tmp/laap-cargo-home-native
  export CARGO_TARGET_DIR=/tmp/laap-cargo-target-native
  export PATH=/Volumes/Shared/PW/laap/.toolchains/cargo/bin:$PATH
  ```

---

## 2. Live Production Deployments

| Component | Production URL / Endpoint | Platform |
| :--- | :--- | :--- |
| **Web Admin Dashboard** | [https://laap-control-center.pages.dev](https://laap-control-center.pages.dev) | Cloudflare Pages |
| **Core API Worker** | [https://laap-api.hussiensalah100.workers.dev](https://laap-api.hussiensalah100.workers.dev) | Cloudflare Workers |
| **PostgreSQL Database** | Supabase Project: `rlhkkszeagixqmvtmknx` | Supabase Cloud |
| **macOS Desktop App** | Local: `/tmp/laap-target/release/bundle/macos/LAAP Desktop.app`<br/>DMG: `release-dmg/LAAP Desktop_0.2.0_aarch64.dmg` | Tauri v2 + Rust |

---

## 3. Key Subsystems & State

### Desktop App (`apps/desktop`)
- **Theme:** Hextech Tactical (deep obsidian slate `#06080D`, vibrant Hextech gold `#F5CC70`, runic teal `#0AC8B9`).
- **Architecture:** Feature-Sliced Architecture (`src/features/`, `src/shared/`, `src/styles/`).
- **Modes:**
  - **Personal Roster:** Standalone local account switcher backed by native SQLite (`local_store`). Zero cloud dependency.
  - **Shared Accounts:** Cloud account pool backed by the API Worker and Supabase PostgreSQL.
- **Persistent Auth:** The desktop keeps its LAAP bearer token in the OS keychain only when "Keep me signed in" is enabled. Browser sessions use an HttpOnly cookie; no auth token is stored in `localStorage`.
- **Dialogs & Modals:** Native WebKit `window.confirm` is blocked in macOS Tauri webviews; all dialogs use custom React modals (`DeleteConfirmModal.tsx`, `AddAccountModal.tsx`, etc.).

### Core API (`apps/api`)
- Runs as a standard Node HTTP server locally and a Cloudflare Worker in production (`worker.ts`).
- Supports CORS with `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`.
- Validates requests using Zod schemas from `@laap/validation`.

### Database (`supabase/`)
- The production hardening migration is `20260904000000_production_hardening.sql`; apply it after the earlier migrations with `supabase db push --linked`.
- Admin access is resolved from `public.user_roles` on every API request (with JWT metadata only as a legacy backstop), so role changes take effect without waiting for an old JWT to expire.

---

## 4. Immutable Security Invariants

1. **LAAP credentials:** LAAP passwords are hashed server-side; browser auth uses HttpOnly cookies and the desktop uses the OS keychain for an optional LAAP bearer token.
2. **Riot boundary (deferred):** The current account session capture/injection path is intentionally unchanged for now. It is not an official Riot API and must not be described as ban-proof or Riot-approved.
3. **Keyring Private Keys:** Ed25519 private keys remain strictly in the native OS keychain (`keyring-rs`).
4. **No Process Scraping:** Zero DLL injection, zero process memory hooking, zero reading of League lockfile credentials.
5. **Clean Restores:** Player personal settings in `RiotClientPrivateSettings.yaml` are backed up before a managed launch and restored on release or crash recovery when Riot is not running.
6. **Lease liveness:** Desktop heartbeats run every 20 seconds; the API reaper marks sessions stale after 120 seconds without a heartbeat (subject to reconnect grace).

---

## 5. Verification Commands

Run before pushing any code:

```bash
# 1. Typecheck and unit tests
npm run typecheck
npm run test
npm run build

# 2. Rust desktop unit tests
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml

# 3. Clean and verify git status
git status
```
