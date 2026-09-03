# Developer Onboarding & Environment Guide

Welcome to the **LAAP** developer guide. This document outlines how to set up your local development environment, work with the monorepo workspaces, run tests, and package native binaries.

---

## 1. Monorepo Architecture

LAAP is managed as an `npm` workspace monorepo consisting of:

```text
├── apps/
│   ├── desktop/          # Tauri v2 + React 19 Desktop Launcher
│   │   ├── src/          # Feature-Sliced UI (personal-roster, team-vault, device, auth)
│   │   └── src-tauri/    # Native Rust Core (riot process control, Ed25519 identity, local store)
│   ├── api/              # Domain-Driven Node HTTP Server + Cloudflare Worker
│   └── admin/            # Executive Web Control Center (React 19 + Tailwind)
├── packages/
│   ├── types/            # Shared TypeScript contracts & DTOs
│   └── validation/       # Zod schemas enforcing data integrity across boundaries
├── supabase/             # PostgreSQL migrations, RLS policies, and SQL seed scripts
└── docs/                 # Architecture, API, and production manuals
```

---

## 2. Prerequisites & Environment Setup

### Required Tools
- **Node.js**: `v22.0.0` or higher
- **Rust Toolchain**: `stable` (MSRV 1.80+)
- **Operating System Packages**:
  - **macOS**: `xcode-select --install`
  - **Windows**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (select "Desktop development with C++") and WebView2 Runtime (pre-installed on Windows 10/11).

### Initial Bootstrap
```bash
git clone https://github.com/Kingof3O/laap.git
cd laap

# Install all npm dependencies across all workspaces
npm install
```

---

## 3. Running Services Locally

### A. Local API & Web Admin
```bash
# Starts API server on port 4170 and Admin web portal on port 5173
npm run dev
```

- **API Endpoint:** `http://127.0.0.1:4170`
- **Admin Dashboard:** `http://localhost:5173`
- **Default Local Admin Credentials:** `admin@laap.local` / `ChangeMe!2026`

### B. Desktop App (Frontend + Native Rust Core)
In a dedicated terminal window:
```bash
npm --workspace @laap/desktop run dev
```
Tauri will automatically compile the Rust native binary in debug mode, launch the native OS window, and connect to Vite's Hot Module Replacement (HMR) server.

---

## 4. Testing & Verification

### Running API Vitest Tests
```bash
npm --workspace @laap/api run test
```

### Running Native Rust Unit Tests
```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

### Type Checking
```bash
npm run build
```

---

## 5. Native Packaging (Production Builds)

### Building macOS `.app` & `.dmg`
```bash
npm --workspace @laap/desktop run build
npx --workspace @laap/desktop tauri build
```
Artifacts are generated in `apps/desktop/src-tauri/target/release/bundle/macos/`.

### Building Windows `.msi` / `.exe`
Run the same command on a Windows machine:
```powershell
npm --workspace @laap/desktop run build
npx --workspace @laap/desktop tauri build
```
Artifacts are generated in `apps/desktop/src-tauri/target/release/bundle/msi/`.

---

## 6. Coding Standards & Conventions

1. **Strict Feature Slices**: In `apps/desktop/src/features/`, keep all feature-specific logic within its feature folder. Never import private internal components from other features.
2. **Domain Isolation**: When adding API endpoints, always add the method to the corresponding domain interface in `apps/api/src/services/domain/` first, followed by the SQLite and Supabase implementations.
3. **No AppleDouble Tracking**: On macOS, always verify hidden `._*` files are purged before committing (`find . -name "._*" -delete`).
