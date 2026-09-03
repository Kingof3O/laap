# Contributing to LAAP

Thank you for your interest in contributing to **LAAP (League Account Access Platform)**!

LAAP is designed with strict architectural boundaries to guarantee safety, zero plain-text password storage, and high-performance esports operations.

---

## Architectural Principles

1. **Zero Plain-Text Secrets**:
   - LAAP **never** accepts, stores, transmits, or handles plaintext Riot account passwords.
   - All session handling uses token injection into temporary private settings YAML files.
2. **Strict Domain Modularity**:
   - **Backend (`apps/api`)**: Follows the Interface Segregation Principle with discrete domain services (`auth`, `accounts`, `leases`, `devices`, `admin`). Never create monolithic God objects.
   - **Frontend (`apps/desktop/src`)**: Follows Feature-Sliced Design (`features/personal-roster/`, `features/team-vault/`, `features/device/`, `features/auth/`). Shared UI primitives belong in `src/shared/ui/`.
   - **Native Core (`apps/desktop/src-tauri`)**: Organized into `riot/`, `local_store/`, and `commands/`. Never place IPC handlers, storage logic, and process control in one file.

---

## Local Development Workflow

### Prerequisites
- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`
- **Rust Toolchain**: `stable` (MSRV 1.80+) with `cargo`
- **Platform SDKs**:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Visual Studio C++ Build Tools & WebView2 Runtime

### Setup
```bash
# Clone the repository
git clone https://github.com/Kingof3O/laap.git
cd laap

# Install all workspace dependencies
npm install
```

### Running Locally
```bash
# Start the local API server and Web Admin Dashboard
npm run dev

# In a separate terminal, launch the desktop app
npm --workspace @laap/desktop run dev
```

---

## Git Workflow & Conventions

### Branch Naming
- `feature/<short-description>` (e.g. `feature/hotkey-switcher`)
- `fix/<short-description>` (e.g. `fix/macos-settings-path`)
- `refactor/<short-description>` (e.g. `refactor/modular-router`)

### Commit Messages
We adhere to **Conventional Commits**:
- `feat: <description>`: Adds new user-facing functionality
- `fix: <description>`: Fixes an issue or bug
- `refactor: <description>`: Code restructuring with no behavioral changes
- `docs: <description>`: Documentation changes
- `perf: <description>`: Performance optimization
- `chore: <description>`: Maintenance or build script updates

---

## Quality & Security Guidelines

Before opening a pull request, ensure:
1. No compiler warnings or lint errors are introduced.
2. The code adheres strictly to the modular domain boundaries.
3. No `.env`, secret keys, or local test tokens are committed.
4. On macOS, ensure hidden AppleDouble files (`._*`) are removed before staging (`find . -name "._*" -delete`).

---

## Code of Conduct

We are dedicated to providing a welcoming, inclusive, and harassment-free experience for everyone. Be respectful, constructive, and collaborative.
