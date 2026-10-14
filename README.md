<div align="center">

<img src="docs/assets/logo.webp" alt="LAAP - League Account Access Platform" width="400" />

<br />

# LAAP
### The High-Performance, Vanguard-Safe Account Launcher for League of Legends

**Switch accounts in one click. Zero passwords handled. 100% Vanguard clean.**

[![Latest Release](https://img.shields.io/github/v/release/Kingof3O/laap?style=for-the-badge&logo=github&color=C8AA6E&label=Latest%20Release)](https://github.com/Kingof3O/laap/releases/latest)
[![CI Status](https://img.shields.io/github/actions/workflow/status/Kingof3O/laap/test-and-lint.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/Kingof3O/laap/actions)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?style=for-the-badge&logo=apple&logoColor=white)](docs/ARCHITECTURE.md)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2.2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Anti-Cheat Safe](https://img.shields.io/badge/Vanguard-100%25%20Clean-10B981?style=for-the-badge)](docs/ANTI_BAN_VERIFICATION.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-C8AA6E?style=for-the-badge)](LICENSE)

<br />

[**⬇️ Download for Windows (.exe)**](https://github.com/Kingof3O/laap/releases/latest) &nbsp;&bull;&nbsp; [**⬇️ Download for macOS (.dmg)**](https://github.com/Kingof3O/laap/releases/latest)

<br />

[Architecture](docs/ARCHITECTURE.md) &bull; [Anti-Cheat Safety](docs/ANTI_BAN_VERIFICATION.md) &bull; [Security Model](docs/SECURITY_MODEL.md) &bull; [Profile Customization](docs/profile-customization.md) &bull; [Development Guide](docs/DEVELOPMENT.md)

</div>

---

## ⚡ What is LAAP?

Switching between your mains, smurfs, and scrim accounts in League of Legends has always been slow and clunky—typing passwords, solving 2FA prompts, and waiting through tedious client restarts.

**LAAP** solves this permanently. Built from the ground up with **Tauri v2** and **Rust**, LAAP provides instantaneous, 1-click account switching directly on your desktop. It functions as an external configuration manager that boots the official Riot Client with your authenticated session, completely eliminating password handling, keystroke injection, and memory hooks.

```
Pick Account ➔ Click Play ➔ Riot Client boots ➔ Jump on the Rift
```

---

## 🌟 Core Pillars

| ⚡ Instant 1-Click Launch | 🛡️ 100% Vanguard Clean | 💎 Hextech Sapphire Design |
|:---|:---|:---|
| Direct authenticated boot into League of Legends in seconds. No re-typing passwords or waiting for 2FA. | Pure external launcher. Zero memory injection, zero DLL hooks, and bit-for-bit identical game files. | Authentic League of Legends aesthetic featuring Hextech Gold, deep sapphire hues, and official rank crests. |

---

## ✨ Key Features

### 👑 Hero Quick-Resume Strip
Your most recently played account is always front and center at the top of your roster. View your last-played timestamp (`Played 2h ago`), official rank tier crest, and jump straight back into queue with a single click of the prominent **Resume Game** button.

### 🌐 Multi-Region Roster & Organization
Manage dozens of accounts with ease:
- **Instant Search (`⌘K` / `Ctrl+K`)**: Rapidly filter across summoner names, regions, and custom notes.
- **Region Filtering**: 1-click filter across `KR`, `EUW`, `NA`, `EUNE`, `BR`, and more.
- **Competitive Rank Crests**: Official colored badges for **Challenger**, **Grandmaster**, **Master**, **Diamond**, **Emerald**, **Platinum**, and below.
- **Multi-Criteria Sorting**: Sort your roster by competitive rank tier, summoner name, last played activity, or date added.

### 🎨 Rich Profile Customization
Personalize every profile with local avatar uploads or pick from an integrated, searchable catalog of official League summoner icons. Keep private notes on champion pools or secondary roles in your encrypted local store.

### 🔒 Hardware-Backed Security (Zero Passwords Stored)
LAAP **never stores or transmits Riot account passwords**. Sessions are encrypted at rest using AES-GCM with hardware keys stored natively in the **macOS Keychain** or **Windows Credential Manager**.

### 🛡️ Match In-Progress Guard
Never worry about accidentally switching accounts while in a game. LAAP actively checks for running League match processes and prompts for confirmation before stopping or switching clients.

---

## 📦 Two Release Editions

LAAP is distributed in two lightweight editions tailored to how you play:

| Feature | **LAAP Offline** *(Community Edition)* | **LAAP Desktop** *(Team Edition)* |
|:---|:---:|:---:|
| **Primary Use Case** | Solo players, smurfs, and streamers | Competitive teams, scrim rosters, and friend groups |
| **Personal Roster** | Unlimited local accounts | Unlimited local accounts |
| **Shared Team Vault** | &mdash; | Cloud account pool with atomic single-active locking |
| **Network Footprint** | **100% Offline** (Zero telemetry, zero external calls) | Private authenticated team API via JWT |
| **Hardware Binding** | OS Keychain hardware keypair | Ed25519 challenge-response verification |
| **Download Packages** | `.exe` (Windows) &bull; `.dmg` (macOS) | `.exe` (Windows) &bull; `.dmg` (macOS) |

---

## 🛡️ Anti-Cheat & Vanguard Safety

LAAP operates strictly as an **external pre-launch configuration manager**. It is architected specifically to keep your system and game installation clean:

- **Zero Memory Injection**: Never calls `WriteProcessMemory`, `VirtualAllocEx`, or attaches debuggers to League or Riot processes.
- **Zero DLL or Code Hooks**: Does not hook DirectX graphics pipelines, inject DLLs, or manipulate OS hooks.
- **Bit-for-Bit Identical Files**: Game binaries, data archives (`.wad`), and configuration files remain completely untouched.
- **Official Client Execution**: Spawns the authentic Riot Client binary using standard, verified arguments (`--launch-product=league_of_legends --launch-patchline=live`).
- **No In-Game Advantage**: No overlays, macros, timers, or automation.

👉 **Inspect the verified source code proofs in our [Anti-Cheat Verification Guide](docs/ANTI_BAN_VERIFICATION.md).**

---

## 🖥️ Cross-Platform Native Parity

LAAP delivers a seamless native experience across both major operating systems:

| Subsystem | Windows (10 & 11 64-bit) | macOS (Apple Silicon & Intel) |
|:---|:---|:---|
| **Installation** | Single-user NSIS (`%LOCALAPPDATA%\Programs\LAAP`) &mdash; **Zero UAC prompt** | Native drag-and-drop Apple Disk Image (`.dmg`) & App Bundle |
| **Key Storage** | Windows Credential Manager (`windows-native`) | Apple Keychain (`apple-native`) |
| **Riot Data Path** | `%LOCALAPPDATA%\Riot Games\Riot Client\Data` | `~/Library/Application Support/Riot Games/Riot Client/Data` |
| **Process Control** | Direct dispatch to `RiotClientServices.exe` | Native dispatch to `/Applications/Riot Client.app` |
| **Search Hotkey** | `Ctrl+K` | `⌘K` |

---

## ⌨️ Tactical Hotkeys

| Shortcut | Action | Scope |
|:---|:---|:---|
| **`⌘K` / `Ctrl+K`** | Focus instant summoner search bar | Global |
| **`Esc`** | Clear search filter or close modal | Global |
| **`Tab`** | Navigate between summoner cards and action buttons | Roster Stage |
| **`Enter` / `Space`** | Launch game on selected summoner profile | Focused Card |

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────┐       ┌──────────────────────────────────────┐
│       LAAP Desktop Launcher            │       │       Web Control Center             │
│   (Tauri v2 + Rust + React 19)         │       │     (React 19 + Tailwind CSS)        │
└──────────────────┬─────────────────────┘       └──────────────────┬───────────────────┘
                   │                                                │
                   │ typed contracts                                │ typed contracts
                   ▼                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                    Shared Packages (@laap/types, @laap/validation)                     │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │ authenticated HTTP / Ed25519 signatures
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│              LAAP Core API (Cloudflare Worker / Node HTTP)                            │
│               - Domain Services: IAuth, IAccount, ILease, IDevice                     │
│               - Atomic lease acquisition functions & access control                   │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│            Supabase Cloud Infrastructure (PostgreSQL, Vault, RLS)                     │
│               - Atomic single-active lease enforcement via Postgres RPC               │
│               - Encrypted session store with Row Level Security                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

For full architectural diagrams and deep-dive domain models, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🚀 Development & Build Guide

### Prerequisites
- **Node.js**: v22 LTS or newer
- **Rust**: 1.80+ (`rustc` & `cargo`)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: Visual Studio Build Tools (C++ Desktop Development) and WebView2 Runtime

### Setup & Run
```bash
# Clone the repository
git clone https://github.com/Kingof3O/laap.git
cd laap

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building Release Packages

#### LAAP Desktop (Team Edition)
```bash
# macOS (generates .app and .dmg)
npm --workspace @laap/desktop run build
npx --workspace @laap/desktop tauri build --bundles app,dmg

# Windows (generates .exe and .msi)
npm --workspace @laap/desktop run build
npx --workspace @laap/desktop tauri build --bundles msi,nsis
```

#### LAAP Offline (Community Edition)
```bash
# macOS (generates .app and .dmg)
npm --workspace @laap/desktop run build:offline
npx --workspace @laap/desktop tauri build --config src-tauri/tauri.offline.conf.json --bundles app,dmg

# Windows (generates .exe and .msi)
npm --workspace @laap/desktop run build:offline
npx --workspace @laap/desktop tauri build --config src-tauri/tauri.offline.conf.json --bundles msi,nsis
```

### Running Test Suites
```bash
# Run monorepo unit and TypeScript tests
npm run test

# Run native Rust desktop safety tests
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

---

## 📜 License

Distributed under the [MIT License](LICENSE).
