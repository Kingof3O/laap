# LAAP Control Center

LAAP is a secure control plane for brokering access to a shared League of Legends / Riot account pool. This repository now ships a runnable local MVP: a dark, responsive admin dashboard backed by an authenticated API, durable persistence, atomic lease operations, and typed module boundaries.

## Workspace

```text
apps/admin       React + Vite + TypeScript + Tailwind dashboard
apps/api         Node HTTP API + SQL.js persistence + auth/lease services
apps/desktop     Tauri/Rust native core boundary
packages/types   Shared domain types and discriminated status unions
packages/validation  Zod schemas for API and IPC boundaries
supabase/        Database migration and server-side security boundary
design-system/   UI UX Pro Max generated source of truth
```

## Local development

```bash
npm install
npm run dev
```

`npm run dev` starts both the API (`http://127.0.0.1:4170`) and dashboard (`http://localhost:5173`). Development mode seeds a safe local workspace and signs in automatically. Manual local credentials are `admin@laap.local` / `ChangeMe!2026`; change them outside local development.

The API persists its local development database under `apps/api/.data` (or `LAAP_DATA_DIR`) and exposes authenticated routes for accounts, assignments, devices, sessions, leases, and audit events. Lease claims are serialized inside a transaction and missed heartbeats are reaped after 90 seconds.

The dashboard is intentionally dark-only. The UI uses semantic CSS variables, Lucide SVG icons, keyboard-visible focus states, responsive layouts, and reduced-motion fallbacks. Credential writes go to an encrypted local vault adapter for development; production should use Supabase Vault through an authenticated Edge Function. Credentials are never returned to the browser dashboard or written to client storage.

See [docs/PRODUCTION.md](docs/PRODUCTION.md) for the deployment gates and required external secrets.
