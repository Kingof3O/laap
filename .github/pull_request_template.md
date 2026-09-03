## Summary of Changes

<!-- Provide a concise description of what this PR does and why it was created. -->

## Architectural Domain Affected

- [ ] **Desktop Frontend (`apps/desktop/src`)**
  - [ ] Personal Roster feature
  - [ ] Team Vault feature
  - [ ] Device/Hardware subsystem
  - [ ] Shared UI primitives
- [ ] **Native Rust Core (`apps/desktop/src-tauri`)**
  - [ ] `riot/` module (process, paths, session_manager, provisioner)
  - [ ] `local_store/` module (models, storage, manager)
  - [ ] `commands/` module (device, local_accounts, session)
- [ ] **Backend API (`apps/api`)**
  - [ ] Domain service interfaces (`services/domain/`)
  - [ ] SQLite domain implementations (`services/sqlite/`)
  - [ ] Supabase domain implementations (`services/supabase/`)
  - [ ] HTTP route handlers (`routes/`)
- [ ] **Admin Web App (`apps/admin`)**
- [ ] **Shared Packages (`packages/types`, `packages/validation`)**
- [ ] **Documentation (`docs/*`, `README.md`)**

## Breaking Changes

- [ ] **Yes** (describe below)
- [ ] **No**

## Testing & Quality Checklist

- [ ] Verified TypeScript compilation (`tsc --noEmit`).
- [ ] Verified Rust unit tests (`cargo test`).
- [ ] Zero plain-text passwords or secrets introduced.
- [ ] Modular boundaries respected (no cross-domain spaghetti or God files).
