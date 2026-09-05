# Changelog

All notable changes to the **LAAP** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-09-05

### ⚡ Simplified Architecture & Robust Online Engine
- **Streamlined Status**: Replaced granular process state machines (`IN_GAME` vs `IN_CLIENT`) with clean binary status (`Ready` / `Available` vs `In Use`).
- **Instant Game Launches**: Dropped hardware Ed25519 nonce challenge ceremony from lease acquisition; launches now authenticate directly with verified JWT tokens with zero key mismatch errors.
- **Relaxed Liveness Heartbeat**: Reduced heartbeat network churn to a lightweight 60s ping without heavy telemetry payloads.
- **30-Day Session Persistence**: 30-day token lifetime with dual-layer storage in OS keychain and localStorage; added "Remember me on this computer (30 days)" option.
- **Modular Operator Access Control**: Added user-centric account assignment and instant 1-click revocation dossier under `Access`.
- **Streamlined Navigation**: Removed compliance clutter (`Devices` and `Audit log`) from admin navigation, focusing on `Home`, `Accounts`, `Access`, and `People`.
- **Windows Subsystem Fix**: Fixed console window popup on Windows release builds using `windows_subsystem = "windows"`.

---


## [0.2.0] - 2026-09-03

### 🎨 Hextech Tactical UI/UX Overhaul
- Official Hextech branding integration (`logo.webp` horizontal banner and `favicon.webp` squircle emblem).
- Redesigned studio overview rail: replaced technical jargon (`Ed25519 Keychain`, anti-cheat guarantees) with **Quick Launch**, **Roster Breakdown** with visual readiness and server distribution charts, and a concise external-launcher boundary note.
- Polished **Shared Accounts** login flow with natural placeholders, `Keep me signed in`, and clean actions.
- Universal terminology alignment: cleanly structured around **Personal Roster** and **Shared Accounts**.
- Instant keyboard search (`⌘K` / `Ctrl+K`) for rapid account lookup.
- Quick server region filter pills (`ALL`, `EUW`, `EUNE`, `NA`, `KR`, `BR`).
- Layout view density switcher between **Tactical Grid** and **Compact Table**.
- Replaced browser WebKit dialogs (`confirm`, `alert`) with custom Hextech React modal overlays.
- Built **In-App GitHub Release Update System**: automatic semver polling on launch, Hextech update modal with highlights, and manual "Check for Updates" trigger in Settings.
- Designed **Floating HUD Glassmorphism Toaster**: translucent dark emerald notifications anchored to viewport bottom-right with smooth entrance animations.
- Expanded summoner portfolio to 22 authentic competitive profiles across 5 major regions (`KR`, `EUW`, `NA`, `EUNE`, `BR`).
- Generated complete native icon bundle (`icon.icns`, `icon.ico`, all PNG sizes) and automated multi-platform `.dmg`, `.msi`, and `.exe` packaging.

### 🏛️ Super Deep Modular Architecture
- **Backend API (`apps/api`)**:
  - Segregated monolithic service into fine-grained domain interfaces (`IAuthService`, `IAccountService`, `ILeaseService`, `IDeviceService`, `IAdminService`).
  - Implemented modular SQLite and Supabase domain sub-services.
  - Extracted route controllers into domain-specific route handlers (`routes/auth`, `routes/accounts`, `routes/leases`, `routes/devices`, `routes/admin`).
  - Reduced `server.ts` and `laap-service.ts` from 300+ line monoliths down to lean coordinator facades.
- **Desktop Frontend (`apps/desktop/src`)**:
  - Adopted Feature-Sliced Architecture: `features/personal-roster/`, `features/team-vault/`, `features/auth/`, and `features/device/`.
  - Extracted standalone `useDevice` hook to isolate hardware key cryptography from account pool state.
  - Extracted `AccountRosterDisplay`, `ActiveLeaseBanner`, and `useProvisioningSandbox` primitives.
  - Reduced `App.tsx` from 551 lines down to ~140 lines.
- **Native Rust Core (`apps/desktop/src-tauri`)**:
  - Deconstructed flat `commands.rs` into `src/commands/` (`device.rs`, `local_accounts.rs`, `session.rs`, `mod.rs`).
  - Deconstructed `session.rs` into `src/riot/` (`paths.rs`, `process.rs`, `session_manager.rs`, `provisioner.rs`).
  - Deconstructed `local_store.rs` into `src/local_store/` (`models.rs`, `storage.rs`, `manager.rs`, `mod.rs`).

---

## [0.1.0] - 2026-08-30

### Initial Release
- Basic account leasing with SQLite database.
- Prototype Tauri desktop wrapper.
- Proof of concept token YAML injection into Riot settings directory.
- Basic web dashboard with static mock data.
