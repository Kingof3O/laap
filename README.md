# LAAP Tactical Launcher & Control Center

**LAAP** (League Account Access Platform) is a secure, high-performance tactical control plane and desktop launcher for managing and switching between League of Legends / Riot accounts.

It combines an authentic, esports-grade **Hextech Tactical Desktop Launcher** (built with Tauri + Rust + React 19) with a centralized **Web Control Center** (built with Cloudflare Pages + Workers + Supabase).

---

## Key Features

- **🎮 Dual Operation Modes:**
  - **Personal Roster (Local Mode):** Completely standalone 1-click account switching on your local machine. Zero cloud dependency, zero passwords required.
  - **Team Vault (Cloud Mode):** Centralized team account pool with atomic single-active lease enforcement, role-based access control (Admins & Operators), and hardware Ed25519 device authentication.
- **⚡ Passwordless Session Sandboxing:**
  - LAAP **never** accepts, stores, injects, or transmits Riot passwords.
  - Users sign in once with "Stay signed in" enabled; LAAP captures the authenticated session token from `RiotClientPrivateSettings.yaml`, encrypts it, and injects it seamlessly upon launch.
  - Personal League settings and configurations are automatically backed up and restored upon session release or sign-out.
- **🛡️ Hardware Identity & Cryptographic Security:**
  - Devices generate an Ed25519 keypair held in the native OS keychain.
  - Lease claims require a cryptographic signature over a server nonce, preventing session hijacking.
- **🎨 Hextech Tactical Design Language:**
  - Authentic League of Legends / Riot client aesthetic: deep obsidian slate, chamfered metallic gold framing, and runic teal status beacons.
  - Instant account search (`⌘K` / `Ctrl+K`), quick server region filter pills (`ALL`, `EUW`, `EUNE`, `NA`, `KR`, `BR`), and view density switcher (`Tactical Grid` vs `Compact Table`).
  - Persistent "Remember me on this PC" authentication across app restarts.
- **🏢 Executive Control Center (Web Admin):**
  - Full visibility over pooled accounts, active leases, verified hardware devices, and tamper-evident audit logs.

---

## Workspace Architecture

```text
apps/
├── admin/          # React 19 + Vite + Tailwind CSS Web Control Center
├── api/            # Node HTTP API + Cloudflare Worker + SQL.js / Supabase adapters
└── desktop/        # Tauri v2 + Rust native core + Hextech Tactical React 19 launcher
    ├── src/
    │   ├── components/  # Modular UI (Header, SubNavbar, Cards, Modals)
    │   ├── hooks/       # useAuth, useLocalAccounts, useCloudAccounts
    │   ├── lib/         # Typed API client, constants, and models
    │   └── styles/      # Hextech Tactical stylesheet
    └── src-tauri/       # Native Rust Ed25519 keychain, session sandboxing, SQLite vault
packages/
├── types/          # Shared domain DTOs, lease models, and discriminated status unions
└── validation/     # Shared Zod validation schemas for API and IPC boundaries
supabase/           # PostgreSQL schema, RLS policies, atomic lease RPCs, and migrations
docs/               # Technical architecture, API reference, and deployment checklists
```

---

## Quick Start (Local Development)

### Prerequisites
- Node.js >= 22.0.0
- Rust toolchain (for Tauri desktop app)

```bash
# 1. Install workspace dependencies
npm install

# 2. Start the API and Web Admin dashboard in development mode
npm run dev
```

- **Web Admin Dashboard:** `http://localhost:5173`
- **Local API:** `http://127.0.0.1:4170`
- **Default Local Admin Credentials:** `admin@laap.local` / `ChangeMe!2026`

### Running the Desktop App

```bash
# Run the Tauri native desktop app in development mode
npm --workspace @laap/desktop run dev
```

---

## Build & Test Commands

```bash
# Run all TypeScript typechecks and unit tests
npm run typecheck
npm run test
npm run build

# Run native Rust unit tests
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml

# Build the release native macOS application (.app & .dmg)
npx --workspace @laap/desktop tauri build --ci
```

---

## Live Deployments

- **Web Admin Dashboard:** [https://laap-control-center.pages.dev](https://laap-control-center.pages.dev)
- **API Worker:** [https://laap-api.hussiensalah100.workers.dev](https://laap-api.hussiensalah100.workers.dev)
- **macOS Installer Artifact:** `.artifacts/LAAP Desktop_0.1.0_aarch64.dmg`

---

## Security Invariants

1. **No Password Storage:** LAAP never prompts for, stores, logs, or transmits plaintext Riot passwords.
2. **Session Token Sandboxing:** Only encrypted session blobs from Riot's supported client login are stored and injected.
3. **Keychain Private Keys:** Ed25519 private keys never leave the native client's secure OS keychain.
4. **Hardware Verification:** Every cloud lease requires a cryptographic challenge-response signature signed by the registered device.
5. **Zero Memory Scraping:** No DLL injection, memory scraping, or reverse-engineered League lockfile hooks.

---

## Documentation

- [Architecture & Design Decisions](docs/ARCHITECTURE.md)
- [REST API Reference](docs/API.md)
- [Production Deployment Guide](docs/PRODUCTION.md)
- [Agent Handoff Guide](docs/AGENT_HANDOFF.md)
