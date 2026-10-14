# ⚡ LAAP Desktop Client (`@laap/desktop`)

<div align="center">

[![Platform: Windows & macOS](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Kingof3O/laap)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2.2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Anti-Cheat Safe](https://img.shields.io/badge/Runtime-Zero%20memory%20or%20code%20injection-10B981?style=for-the-badge)](../../docs/ANTI_BAN_VERIFICATION.md)

</div>

---

## 📖 Overview

The **LAAP Desktop Client** is an esports-grade account access launcher engineered with **Tauri v2**, **Rust**, and **React 19**. It provides instantaneous 1-click switching between League of Legends accounts without handling Riot passwords, injecting keystrokes, or tampering with game memory.

### Key Capabilities:
- **Hero Quick-Resume Strip (Layout A)**: The most recently played summoner is surfaced at the top of the roster with relative activity tracking (`Played 2h ago`), official tier badge, and a 1-click **Resume Game** button.
- **Hextech Sapphire Aesthetic**: Authentic League of Legends client visuals featuring Hextech Gold borders, deep cobalt blues, and official rank crests.
- **Full-Width Responsive Grid**: 3-4 column grid without cramped sidebars, ensuring cards have full breathing room.
- **Hardware-Backed Device Trust**: Ed25519 cryptographic keypairs stored in native OS keychains (**macOS Keychain** / **Windows Credential Manager**).
- **Match In-Progress Guard**: Detects running League processes and prompts for confirmation before terminating or switching profiles.
- **Complete Profile Customization**: Searchable League icon catalog, local image uploads with metadata stripping, notes, and optional loopback League Client rank sync.

---

## 📸 Interface Preview

<div align="center">
  <img src="../../docs/assets/launcher-grid.png" alt="LAAP Personal Roster with Hero Quick-Resume and Hextech Sapphire styling" width="88%" />
  <br /><br />
  <img src="../../docs/assets/profile-editor.png" alt="Profile customization editor with live preview, icon picker, and notes" width="75%" />
</div>

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
| **Distribution Packages** | `.msi` (WiX) & `.exe` (NSIS) | `.dmg` & `.app` (Universal Darwin) |

---

## 🏛️ Internal Directory Structure

The application follows **Feature-Sliced Design** in TypeScript and a **Decoupled Modular Architecture** in Rust:

```text
apps/desktop/
├── src/                                  # React 19 Presentation Tier
│   ├── features/
│   │   ├── personal-roster/              # Standalone local account roster
│   │   │   ├── PersonalRosterView.tsx    # Primary roster controller & sandbox bridge
│   │   │   ├── AddAccountModal.tsx       # Credential capture sandbox modal
│   │   │   └── useLocalAccounts.ts       # Standalone portfolio state & storage sync
│   │   ├── team-vault/                   # Cloud Shared Accounts pool (lease claiming, sync)
│   │   │   ├── TeamVaultView.tsx         # Shared team accounts controller
│   │   │   ├── ActiveLeaseBanner.tsx     # Live lease indicator & instant release
│   │   │   └── SyncAccountModal.tsx      # Admin session upload modal
│   │   ├── device/                       # Hardware identity & Ed25519 challenge hook (useDevice)
│   │   └── auth/                         # Shared accounts authentication hook (useAuth)
│   ├── shared/ui/                        # Design system primitives & layout components
│   │   ├── AccountRosterDisplay.tsx      # Layout A container: Hero Quick-Resume + stage
│   │   ├── AccountCard.tsx               # Console Premium account card with rank crest
│   │   ├── AccountListTable.tsx          # High-density compact table view
│   │   ├── Header.tsx                    # Branding banner, navigation tabs, status indicators
│   │   ├── SubNavbar.tsx                 # Search filter, regional pills, view toggle
│   │   ├── EditAccountModal.tsx          # Live two-column profile customizer
│   │   ├── IconPicker.tsx                # Searchable Data Dragon icon catalog
│   │   ├── RankPicker.tsx                # Official rank tier selector with emblem assets
│   │   ├── SettingsModal.tsx             # Configuration, hardware verification, cache flush
│   │   └── UpdateModal.tsx               # In-app GitHub release notification dialog
│   ├── context/
│   │   ├── ToastContext.tsx              # Global floating HUD glassmorphism toasts
│   │   └── RiotOperations.tsx            # Process lock & running match safety context
│   ├── lib/
│   │   ├── api.ts                        # Typed IPC bridge (Tauri invoke + fetch fallback)
│   │   ├── sorting.ts                    # Multi-criteria sorting & rank score calculator
│   │   └── types.ts                      # Frontend domain contracts and DTOs
│   └── styles/
│       ├── tokens.css                    # Hextech Sapphire design tokens & tier colors
│       ├── cards.css                     # Console Premium card geometry & button styles
│       ├── studio.css                    # Hero Quick-Resume strip & responsive layout
│       └── profile.css                   # Customization modal & icon picker styling
└── src-tauri/                            # Native Rust Core Tier
    ├── Cargo.toml                        # Tauri v2, keyring, sysinfo, ed25519-dalek
    └── src/
        ├── riot/                         # Riot Client Subsystem
        │   ├── paths.rs                  # Multi-platform Riot settings path resolution
        │   ├── process.rs                # Vanguard-safe process detection & match guards
        │   ├── session_manager.rs        # YAML token backup, injection, and rollback
        │   ├── provisioner.rs            # Sandbox credential capture poller
        │   └── mod.rs                    # Re-exports & integration unit tests
        ├── local_store/                  # Standalone Portfolio Subsystem
        │   ├── models.rs                 # Account data transfer objects
        │   ├── storage.rs                # Cross-platform JSON file persistence
        │   ├── manager.rs                # CRUD operations & direct launcher integration
        │   └── mod.rs                    # Re-exports & unit tests
        ├── profile_assets.rs             # Local icon caching, image normalization, LCU sync
        ├── commands/                     # Tauri IPC Command Handlers
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
- `device_info() -> DeviceInfo`: Returns the platform, host label, and desktop version.
- `sign_device_nonce(nonce: String) -> Result<String, String>`: Cryptographically signs a server challenge.
- `load_access_token()`, `store_access_token()`, `clear_access_token()`: Stores bearer tokens in OS keychain.

### Standalone Personal Roster
- `list_local_accounts() -> Result<Vec<LocalAccountSummary>, String>`: Lists local portfolio accounts.
- `save_local_account(name, region, session_blob, rank, notes, favorite) -> Result<LocalAccountSummary, String>`: Stores a local profile with encrypted session material.
- `edit_local_account(id, details) -> Result<LocalAccountSummary, String>`: Updates profile metadata.
- `delete_local_account(id: String) -> Result<(), String>`: Deletes an account profile.
- `launch_local_account(id: String) -> Result<(), String>`: Launches a local profile safely.
- `refresh_local_account(id, session_blob) -> Result<(), String>`: Refreshes stored credentials in-place.

### Riot Session Orchestration & Safety
- `start_provisioning_session() -> Result<(), String>`: Starts the local session capture sandbox.
- `poll_provisioning_session() -> Result<Option<String>, String>`: Polls the sandbox for session material.
- `cancel_provisioning_session() -> Result<(), String>`: Restores user configuration and aborts capture.
- `finish_provisioning_session() -> Result<(), String>`: Finishes provisioning and cleans up.
- `runtime_snapshot() -> RuntimeSnapshot`: Detects Riot Client, League Client, and active match presence.
- `close_riot_client() -> Result<(), String>`: Gracefully stops running Riot processes.
- `recover_orphaned_account_session() -> Result<bool, String>`: Restores backups left by abnormal shutdowns.
- `open_external_url(url: String) -> Result<(), String>`: Safely opens URLs in default browser.

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

### Running Test Suites
```bash
# Run native Rust unit and safety tests
cargo test --manifest-path src-tauri/Cargo.toml

# Type check frontend TypeScript
npm run build
```

---

## 📦 Native Release Packaging

### 1. LAAP Desktop (Team Edition)
Includes both Personal Roster and Cloud Shared Accounts pool:

```bash
# On macOS (generates LAAP Desktop.dmg & .app)
npm run build
npx tauri build --bundles app,dmg

# On Windows (generates LAAP-Setup.exe & .msi)
npm run build
npx tauri build --bundles msi,nsis
```

### 2. LAAP Offline (Community Edition)
Compiles the Offline Edition with zero external network traffic and strict webview CSP:

```bash
# On macOS (generates LAAP Offline.dmg & .app)
npm run build:offline
npx tauri build --config src-tauri/tauri.offline.conf.json --bundles app,dmg

# On Windows (generates LAAP-Offline-Setup.exe & .msi)
npm run build:offline
npx tauri build --config src-tauri/tauri.offline.conf.json --bundles msi,nsis
```

### 🛠️ Windows Installer Architecture
- **Zero UAC Elevation**: Configured with `bundle.windows.nsis.installMode = "currentUser"` to install seamlessly to `%LOCALAPPDATA%\Programs\LAAP` without requiring Administrator privileges.
- **Hextech Visual Styling**: Custom uncompressed RGB header (`nsis-header.bmp`) and sidebar (`nsis-sidebar.bmp`) graphics.
- **Fast Clean Uninstallation**: Self-contained uninstaller registered cleanly in Windows Apps & Features.
