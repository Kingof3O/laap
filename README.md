<div align="center">

<img src="docs/assets/logo.webp" alt="LAAP - League Account Access Platform" width="460" />

<br />

**High-performance tactical account control plane and desktop launcher for League of Legends.**

[![CI Status](https://img.shields.io/github/actions/workflow/status/Kingof3O/laap/test-and-lint.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/Kingof3O/laap/actions)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Anti-Cheat: 100% Safe](https://img.shields.io/badge/Anti--Cheat-Vanguard%20Safe-0AC8B9?style=for-the-badge)](docs/ANTI_BAN_VERIFICATION.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-C89B3C?style=for-the-badge)](LICENSE)

[Architecture](docs/ARCHITECTURE.md) • [Anti-Ban Proofs](docs/ANTI_BAN_VERIFICATION.md) • [Security Model](docs/SECURITY_MODEL.md) • [API Reference](docs/API.md) • [Developer Guide](docs/DEVELOPMENT.md) • [Production Guide](docs/PRODUCTION.md)

</div>

---

## 🌟 Overview

**LAAP** (League Account Access Platform) is a credential-free, high-performance tactical control plane and desktop launcher designed for seamless, instantaneous account switching without compromising account security or triggering anti-cheat flags.

It pairs a native **Hextech Tactical Desktop Launcher** (built with Tauri v2, Rust, and React 19) with a centralized **Web Control Center** (Cloudflare Pages + Workers + Supabase).

---

## 📸 Interface Preview

### 🎮 Personal Roster & Quick Launch
Manage your entire summoner portfolio with 1-click credential-free launching, live session health, and real-time server distribution analytics.

<div align="center">
  <img src="docs/assets/launcher-grid.png" alt="LAAP Tactical Launcher - Personal Roster" width="100%" />
</div>

<br />

### 🌐 Shared Accounts
Access shared accounts with atomic single-active session locking, instant release mechanics, and hardware verification.

<div align="center">
  <img src="docs/assets/launcher-shared-accounts.png" alt="LAAP Shared Accounts Login" width="100%" />
</div>

<br />

### 📋 High-Density Compact Table View
Quickly filter, sort, and launch across dozens of accounts with keyboard shortcuts (`⌘K` / `Ctrl+K`) and regional filters (`EUW`, `NA`, `KR`, `EUNE`, `BR`).

<div align="center">
  <img src="docs/assets/launcher-table.png" alt="LAAP Tactical Launcher - Table View" width="100%" />
</div>

---

## 🛡️ Core Pillars

### 1. Passwordless Session Switching
LAAP **strictly never prompts for, collects, stores, or handles Riot account passwords**.
- Operates directly at the authenticated session token layer.
- Authenticate once via the official Riot Client with *"Stay signed in"* enabled.
- LAAP captures the ephemeral session token, secures it in the local OS keychain, and injects it upon launch.
- When switching accounts, personal client settings and configurations are safely preserved and restored.

### 2. Ed25519 Hardware Device Authentication
- Every physical installation generates a unique **Ed25519 cryptographic keypair** stored in the native OS keychain (macOS Keychain / Windows Credential Manager).
- Shared account sessions require signing a time-bound cryptographic challenge (`${timestamp}:${accountId}`).
- Replay attacks, spoofed requests, and unauthorized machines are rejected at the edge.

### 3. Dual Operation Modes
- **🎮 Personal Roster (Local Mode):** Completely standalone 1-click account switching on your local machine. Zero cloud dependency, zero network requirements, zero passwords.
- **🌐 Shared Accounts (Cloud Mode):** Shared account pool with atomic single-active lease enforcement, role-based access control, and real-time activity auditing.

### 4. Visual Roster Breakdown & Health Analytics
- **Readiness Distribution Bar:** Real-time visual progress bar tracking available, in-use, and unsynced accounts.
- **Server Distribution:** Proportional breakdown across competitive server regions (`EUW`, `NA`, `KR`, `BR`, `EUNE`).
- **Quick Launch Dossier:** Instant inspection of selected profiles, last-played timestamps, and one-click game launch.

---

## 🛡️ Anti-Cheat & Vanguard Safety Proofs

LAAP is engineered strictly as an **external, pre-launch configuration manager**. It carries a **0% ban risk**:

- **Zero Memory Injection:** Never calls `WriteProcessMemory`, `VirtualAllocEx`, or attaches debuggers to League or Riot processes.
- **Zero Code Hooks:** Does not inject DLLs, hook DirectX/Direct3D graphics pipelines, or hook system APIs.
- **Zero Game Asset Modifications:** Game files (`.wad`, `.exe`, `.dll`) are completely untouched.
- **Standard Process Execution:** Boots the official Riot Client binary using standard, verified launch flags.
- **Full Riot TOS Compliance:** Does not provide in-game automation, macros, timers, or gameplay advantages.

👉 **Read the full source code proofs and verification guide in [docs/ANTI_BAN_VERIFICATION.md](docs/ANTI_BAN_VERIFICATION.md).**

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────┐       ┌──────────────────────────────────────┐
│       LAAP Desktop Launcher            │       │       Web Control Center             │
│   (Tauri v2 + Rust + React 19)         │       │     (React 19 + Tailwind CSS)        │
└──────────────────┬─────────────────────┘       └──────────────────┬───────────────────┘
                   │                                                │
                   │ typed DTOs & Zod contracts                     │ typed DTOs
                   ▼                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                    Shared Packages (@laap/types, @laap/validation)                     │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │ authenticated HTTP / Bearer / Cookies
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│              LAAP Core API (Node HTTP / Cloudflare Worker: laap-api)                  │
│               - Domain Interfaces: IAuth, IAccount, ILease, IDevice, IAdmin           │
│               - Modular Domain Services (SQLite & Supabase PostgreSQL)                │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│            Supabase Cloud Infrastructure (PostgreSQL, Vault, Auth, RLS)               │
│               - Atomic lease acquisition functions (Postgres RPC)                     │
│               - Row Level Security (RLS) enforcement on all tables                    │
│               - Encrypted session blob storage & access policies                      │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Detailed architectural diagrams and domain breakdowns are available in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🚀 Quick Start (Development)

### Prerequisites
- **Node.js**: v20 or v22 LTS
- **Rust**: 1.80+ (`rustc` & `cargo`)

### Setup
```bash
# 1. Clone repository
git clone https://github.com/Kingof3O/laap.git
cd laap

# 2. Install dependencies
npm install

# 3. Start local development
npm run dev
```

### Building Native Desktop Application
```bash
# Build native macOS App and DMG
npm --workspace @laap/desktop run build
npx --workspace @laap/desktop tauri build --bundles app,dmg
```

---

## 📜 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
