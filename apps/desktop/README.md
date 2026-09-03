# ⚡ LAAP Desktop Client (`@laap/desktop`)

<div align="center">

[![Platform: Windows & macOS](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Kingof3O/laap)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2.2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Anti-Cheat: 100% Safe](https://img.shields.io/badge/Anti--Cheat-Vanguard%20Safe-0AC8B9?style=for-the-badge)](../../docs/ANTI_BAN_VERIFICATION.md)

</div>

---

## 📖 Overview

The **LAAP Desktop Client** is a high-performance, credential-free tactical account launcher engineered with **Tauri v2**, **Rust**, and **React 19**. It provides competitive League of Legends players and esports organizations with instant 1-click account switching without storing plaintext passwords or triggering Riot Vanguard anti-cheat heuristics.

---

## 🖥️ Cross-Platform Architecture

The desktop client provides 100% feature parity and native OS integration across both **Windows** and **macOS**:

| Subsystem | Windows Implementation | macOS Implementation |
|:---|:---|:---|
| **Cryptographic Storage** | Windows Credential Manager (`windows-native`) | Apple Keychain (`apple-native`) |
| **Riot Data Resolution** | `%LOCALAPPDATA%\Riot Games\Riot Client\Data` | `~/Library/Application Support/Riot Games/Riot Client/Data` |
| **Local Store Path** | `%APPDATA%\LAAP\laap_local_accounts.json` | `~/Library/Application Support/LAAP/laap_local_accounts.json` |
| **Process Dispatch** | `C:\Riot Games\...\RiotClientServices.exe` | `/Applications/Riot Client.app` |
| **Process Inspection** | Win32 Process Snapshotting (`sysinfo`) | Darwin Process Snapshotting (`sysinfo`) |
| **External URL Opener** | `cmd /C start "" <url>` | Native `open <url>` |
| **Distribution** | `.msi` (WiX) & `.exe` (NSIS) | `.dmg` & `.app` (Universal Darwin) |

---

## 🏛️ Internal Directory Structure

The application follows **Feature-Sliced Design** in TypeScript and a **Decoupled Modular Architecture** in Rust:

```text
apps/desktop/
├── src/                                  # React 19 Presentation Tier
│   ├── features/
│   │   ├── personal-roster/              # Standalone local account portfolio (CRUD, sandbox, launcher)
│   │   │   ├── AccountGrid.tsx           # Responsive tactical card grid
│   │   │   ├── AccountTable.tsx          # High-density compact table view
│   │   │   ├── AddAccountModal.tsx       # Credential capture sandbox modal
│   │   │   ├── DeleteConfirmModal.tsx    # Hextech modal overlay for account deletion
│   │   │   └── useLocalAccounts.ts       # Standalone portfolio state & storage sync
│   │   ├── team-vault/                   # Cloud Shared Accounts pool (lease claiming, sync)
│   │   ├── device/                       # Hardware identity & Ed25519 challenge hook (useDevice)
│   │   └── auth/                         # Shared accounts authentication hook (useAuth)
│   ├── shared/ui/                        # Design system primitives (Header, Modals, Toasts)
│   │   ├── Header.tsx                    # Branding banner, navigation tabs, status indicators
│   │   ├── SubNavbar.tsx                 # Search filter, regional pills, view toggle
│   │   ├── SettingsModal.tsx             # Configuration, hardware verification, cache flush
│   │   └── UpdateModal.tsx               # In-app GitHub release notification dialog
│   ├── context/
│   │   └── ToastContext.tsx              # Global floating HUD glassmorphism toasts
│   ├── hooks/
│   │   └── useUpdateChecker.ts           # Semver release comparator & GitHub release poller
│   ├── lib/
│   │   ├── api.ts                        # Typed IPC bridge (Tauri invoke + fetch fallback)
│   │   └── types.ts                      # Frontend domain contracts and DTOs
│   └── styles/
│       ├── index.css                     # Base layout, typography, CSS custom properties
│       └── studio.css                    # Hextech tactical theme, HUD toaster, glassmorphism
└── src-tauri/                            # Native Rust Core Tier
    ├── Cargo.toml                        # Tauri v2, keyring, sysinfo, ed25519-dalek
    └── src/
        ├── riot/                         # Decoupled Riot Client Subsystem
        │   ├── paths.rs                  # Multi-platform Riot settings path resolution
        │   ├── process.rs                # Vanguard-safe process detection & termination
        │   ├── session_manager.rs        # YAML token backup, injection, and rollback
        │   ├── provisioner.rs            # 1-click sandbox credential capture poller
        │   └── mod.rs                    # Re-exports & integration unit tests
        ├── local_store/                  # Standalone Portfolio Subsystem
        │   ├── models.rs                 # Account data transfer objects
        │   ├── storage.rs                # Cross-platform JSON file persistence
        │   ├── manager.rs                # CRUD operations & direct launcher integration
        │   └── mod.rs                    # Re-exports & unit tests
        ├── commands/                     # Tauri IPC Command Handlers
        │   ├── device.rs                 # Ed25519 hardware key operations
        │   ├── local_accounts.rs         # Standalone account operations
        │   ├── session.rs                # Riot session injection & browser launcher
        │   └── mod.rs                    # Command router
        ├── device.rs                     # Cryptographic keypair generation & signing
        └── lib.rs                        # Application bootstrap & IPC registration
```

---

## 🔌 Tauri IPC Commands API

The native Rust backend exposes strongly typed IPC commands to the React frontend:

### Device & Cryptography
- `device_public_key() -> Result<String, String>`: Returns the device's Base64 Ed25519 public key.
- `device_platform() -> &'static str`: Returns `"windows"` or `"macos"`.
- `sign_device_nonce(nonce: String) -> Result<String, String>`: Cryptographically signs a server challenge.

### Standalone Personal Roster
- `list_local_accounts() -> Result<Vec<LocalAccountSummary>, String>`: Lists local portfolio accounts.
- `save_local_account(account: LocalAccount) -> Result<(), String>`: Saves or updates an account.
- `delete_local_account(id: String) -> Result<bool, String>`: Deletes an account profile.
- `launch_local_account(id: String) -> Result<(), String>`: Injects session YAML and launches the game.

### Riot Session Orchestration
- `start_login_sandbox() -> Result<(), String>`: Prepares a clean sandbox for credential capture.
- `poll_login_sandbox() -> Result<Option<String>, String>`: Detects newly generated session tokens.
- `cancel_login_sandbox() -> Result<(), String>`: Restores user configuration and aborts capture.
- `clean_riot_session() -> Result<(), String>`: Cleans active sessions and resets to clean state.
- `open_external_url(url: String) -> Result<(), String>`: Safely opens URLs in the default system browser.

---

## 🛠️ Local Development

### Prerequisites
- **Node.js**: `>= 22.0.0`
- **Rust Toolchain**: `stable` (MSRV 1.80+) with `cargo`
- **Platform Compilers**:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Visual Studio C++ Build Tools & WebView2 Runtime

### Running in Development Mode
```bash
# Start frontend HMR server and native Tauri window
npm run dev
```

### Running Tests
```bash
# Run native Rust unit tests
npm test
# Or directly via cargo:
cargo test --manifest-path src-tauri/Cargo.toml

# Type check frontend TypeScript
npm run build
```

---

## 📦 Native Release Packaging

### On macOS
```bash
npm run build
npx tauri build --bundles app,dmg
```
Generates universal Apple Silicon / Intel `.dmg` and `.app` bundles in `src-tauri/target/release/bundle/`.

### On Windows (PowerShell)
```powershell
npm run build
npx tauri build --bundles msi,nsis
```
Generates Windows Installer (`.msi`) and standalone setup executable (`.exe`) in `src-tauri\target\release\bundle\`.
