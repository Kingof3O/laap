# Changelog

All notable changes to the **LAAP** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.7] - 2026-10-14

### Added
- Automatic presence setup with a saved Online/Offline startup choice and tray/menu-bar controls on Windows and macOS.
- System menu account switching, stop, and quit controls with launch and match safety checks.
- Updated upright Windows installer artwork and installer-page verification.
- Pending/success/failure states and retry controls for account icon/rank synchronization.

### Fixed
- Preserve Riot state, cloud leases, and saved session metadata during account switching and shutdown.
- Prevent duplicate launch attempts while tracking slow Riot Client startup.
- Avoid fabricated profiles on IPC errors and make teardown safe when the native event bridge closes.

### Changed
- Updated Rust and JavaScript dependencies, including Vite 8, TypeScript 7, Tailwind 4, Zod 4, Vitest 4, keyring 4, and rand 0.10.
- SignPath Foundation application submitted; Windows installers remain unsigned pending review and signing access.

---

## [0.4.0] - 2026-09-11

### 🚀 Dual-Edition Releases & Operator-First Launcher
- **Dual-Edition Architecture**:
  - **LAAP Desktop (Team Edition)**: Full client containing Personal Roster and Cloud Shared Accounts pool with atomic lease concurrency control.
  - **LAAP Offline (Community Edition)**: 100% local-only build with compile-time decoupling (`VITE_OFFLINE_ONLY=true`) and strict local CSP (`connect-src 'none'`), providing zero-network privacy for solo players and the open-source community.
- **Overhauled Windows Installer Experience**:
  - Configured NSIS `installMode = "currentUser"`: completely eliminates the Windows UAC elevation warning screen, installing cleanly to `%LOCALAPPDATA%\Programs\LAAP` with standard user rights.
  - Custom 24-bit uncompressed RGB Hextech dark/gold artwork (`nsis-sidebar.bmp` and `nsis-header.bmp`).
- **Operator-Centric Flow**:
  - Simplified interaction loop: **"Pick account → Play → Riot launches → Play"**.
  - Refreshed high-resolution documentation screenshots for Tactical Grid, Compact Table, and Shared Accounts views.
- **Automated 4-Way Release Pipeline**:
  - GitHub Actions matrix compiles macOS Team (`.dmg`), macOS Offline (`.dmg`), Windows Team (`.exe`, `.msi`), and Windows Offline (`.exe`, `.msi`) in parallel on release tags.

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
