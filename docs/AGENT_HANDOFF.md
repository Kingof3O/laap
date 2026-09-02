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
| **macOS Desktop App** | Local: `/Applications/LAAP Desktop.app`<br/>DMG: `.artifacts/LAAP Desktop_0.1.0_aarch64.dmg` | Tauri v2 + Rust |

---

## 3. Key Subsystems & State

### Desktop App (`apps/desktop`)
- **Theme:** Hextech Tactical (deep obsidian slate `#06080D`, chamfered Hextech gold `#C89B3C`, runic teal `#0AC8B9`, `Rajdhani` typography).
- **Architecture:** Fully modularized into `src/components/`, `src/hooks/`, `src/lib/`, and `src/styles/`.
- **Modes:**
  - **Personal Roster:** Standalone local account switcher backed by native SQLite (`local_store.rs`). Zero cloud dependency.
  - **Team Vault:** Cloud account pool backed by the API Worker and Supabase PostgreSQL.
- **Persistent Auth:** Stores JWT and user info in `localStorage` under `laap_client_token_v1` and `laap_client_user_v1`. "Remember me on this PC" keeps operators permanently signed in across restarts.
- **Dialogs & Modals:** Native WebKit `window.confirm` is blocked in macOS Tauri webviews; all dialogs use custom React modals (`DeleteConfirmModal.tsx`, `AddAccountModal.tsx`, etc.).

### Core API (`apps/api`)
- Runs as a standard Node HTTP server locally and a Cloudflare Worker in production (`worker.ts`).
- Supports CORS with `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`.
- Validates requests using Zod schemas from `@laap/validation`.

### Database (`supabase/`)
- All migrations are applied up to `20260901121000_fix_admin_lease_role.sql`.
- Admin users are detected using `auth.users.raw_app_meta_data->>'role' = 'admin'`.

---

## 4. Immutable Security Invariants

1. **No Password Storage:** The application intentionally has no password-handling paths for Riot accounts. Only authenticated session blobs are captured and injected.
2. **Keyring Private Keys:** Ed25519 private keys remain strictly in the native OS keychain (`keyring-rs`).
3. **No Process Scraping:** Zero DLL injection, zero process memory hooking, zero reading of League lockfile credentials.
4. **Clean Restores:** Player personal settings in `RiotClientPrivateSettings.yaml` are always backed up before injection and restored upon release.

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
