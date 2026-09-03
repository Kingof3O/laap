<div align="center">

# ⚡ LAAP: League Account Access Platform

**Esports-grade tactical account control plane and desktop launcher for League of Legends.**

[![CI Status](https://img.shields.io/github/actions/workflow/status/Kingof3O/laap/test-and-lint.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/Kingof3O/laap/actions)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-C89B3C?style=for-the-badge)](LICENSE)

[Architecture](docs/ARCHITECTURE.md) • [Security Model](docs/SECURITY_MODEL.md) • [API Reference](docs/API.md) • [Developer Guide](docs/DEVELOPMENT.md) • [Changelog](CHANGELOG.md)

</div>

---

## 🌟 Overview

**LAAP** (League Account Access Platform) is a secure, high-performance tactical control plane and desktop launcher engineered for competitive teams, scrim partners, esports organizations, and power users who need seamless, instantaneous account switching without compromising account safety.

It pairs an authentic **Hextech Tactical Desktop Launcher** (built with Tauri v2 + Rust + React 19) with a centralized **Web Control Center** (built with Cloudflare Pages + Workers + Supabase).

---

## 🛡️ Core Pillars

### 1. Passwordless Session Sandboxing
LAAP **strictly never prompts for, collects, stores, or handles Riot account passwords**.
- Instead, LAAP operates directly at the authenticated token layer.
- Users authenticate once via the official Riot Client with *"Stay signed in"* enabled.
- LAAP captures the ephemeral token from `RiotClientPrivateSettings.yaml`, sandboxes it, and injects it upon launch.
- When an account is released or switched, personal settings and configurations are cleanly restored.

### 2. Ed25519 Hardware Device Authentication
- Every physical installation generates a unique **Ed25519 cryptographic keypair** stored in the native OS keychain (macOS Keychain / Windows Credential Manager).
- Account leases require signing a time-bound cryptographic challenge (`${timestamp}:${accountId}`).
- Replay attacks, spoofed requests, or unauthorized machines are rejected at the edge.

### 3. Dual Operation Modes
- **🎮 Personal Roster (Local Mode):** Completely standalone 1-click account switching on your local machine. Zero cloud dependency, zero network requirements, zero passwords.
- **🌐 Team Vault (Cloud Mode):** Centralized team account pool with atomic single-active lease enforcement, role-based access control (Admins & Operators), and real-time audit logging.

### 4. Hextech Tactical UI/UX
- Bespoke dark-mode aesthetic inspired by the official League of Legends universe: obsidian slate (`#06080D`), chamfered gold framing (`#C89B3C`), and runic teal status beacons (`#0AC8B9`).
- Instant keyboard search (`⌘K` / `Ctrl+K`), quick region filter pills (`ALL`, `EUW`, `NA`, `KR`, etc.), and a view density toggle between **Tactical Grid** and **Compact Table**.

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────┐       ┌──────────────────────────────────────┐
│       LAAP Desktop Launcher            │       │       Web Control Center             │
│   (Tauri + Rust + Hextech React 19)    │       │     (React 19 + Tailwind CSS)        │
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
│               - SQLite / SQL.js Modular Domain Services                               │
│               - Supabase PostgreSQL & RLS Modular Domain Services                     │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│            Supabase Cloud Infrastructure (PostgreSQL, Vault, Auth, RLS)               │
│               - Atomic lease acquisition functions (Postgres RPC)                     │
│               - Row Level Security (RLS) enforcement on all tables                    │
│               - Encrypted session blob storage & admin bypass policies                │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Detailed architectural diagrams and domain breakdowns are available in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 📂 Monorepo Structure

```text
├── apps/
│   ├── desktop/          # Tauri v2 + React 19 Desktop Launcher
│   │   ├── src/
│   │   │   ├── features/ # Vertical Slices (personal-roster, team-vault, device, auth)
│   │   │   ├── shared/   # Reusable UI primitives (Header, SubNavbar, Cards, Modals)
│   │   │   └── context/  # Centralized Toast HUD provider
│   │   └── src-tauri/    # Native Rust Core (riot process control, Ed25519 identity, local store)
│   ├── api/              # Domain-Driven Node HTTP Server + Cloudflare Worker
│   │   ├── src/routes/   # Focused HTTP route handlers
│   │   └── src/services/ # Segregated domain interfaces (IAuth, IAccount, ILease, etc.)
│   └── admin/            # Executive Web Control Center (React 19 + Tailwind)
├── packages/
│   ├── types/            # Shared TypeScript contracts & DTOs
│   └── validation/       # Zod schemas enforcing data integrity across boundaries
├── supabase/             # PostgreSQL migrations, RLS policies, and SQL seed scripts
└── docs/                 # Architecture, security model, API, and developer guides
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `>= 22.0.0`
- **Rust Toolchain**: `stable` with `cargo`
- **C++ Build Tools**: Xcode Command Line Tools (macOS) or Visual Studio Build Tools (Windows)

### Installation
```bash
# 1. Clone repository
git clone https://github.com/Kingof3O/laap.git
cd laap

# 2. Install workspace dependencies
npm install

# 3. Start API and Web Admin Dashboard
npm run dev
```

- **Web Admin Dashboard:** `http://localhost:5173`
- **Local API Server:** `http://127.0.0.1:4170`
- **Default Admin Credentials:** `admin@laap.local` / `ChangeMe!2026`

### Running the Desktop App
```bash
npm --workspace @laap/desktop run dev
```

---

## 📚 Documentation Index

| Guide | Description |
| ----- | ----------- |
| [Architecture Guide](docs/ARCHITECTURE.md) | In-depth technical architecture, boundaries, and domain designs |
| [Security & Cryptography](docs/SECURITY_MODEL.md) | Threat model, zero-password policy, and Ed25519 challenge-response |
| [API Reference](docs/API.md) | Comprehensive REST endpoint reference and error codes |
| [Developer Guide](docs/DEVELOPMENT.md) | Local onboarding, debugging, testing, and native packaging |
| [Production Runbook](docs/PRODUCTION.md) | Cloudflare Pages, Workers, Supabase deployment checklist |
| [Changelog](CHANGELOG.md) | Complete release notes and version history |

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, architectural rules, and the pull request process.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
