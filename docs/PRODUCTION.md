# Production Deployment & Operation Guide

This guide details the deployment process, required secrets, verification steps, and operational procedures for running LAAP in production.

---

## 1. Production Topology

```text
┌─────────────────────────────────────────────────────────────┐
│                      End Users                              │
│          ┌──────────────────────┬────────────────────┐      │
│          │  LAAP Desktop App    │  Web Admin (Pages) │      │
└──────────┴──────────┬───────────┴────────────┬───────┴──────┘
                      │                        │
                      │ HTTPS                  │ HTTPS /api (Proxy)
                      ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│       Cloudflare Worker: laap-api (apps/api/worker.ts)       │
│        - Ed25519 Nonce Verification                         │
│        - Session Token Sandboxing API                       │
│        - JWT Verification & Rate Limiting                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Authenticated Service-Role Connection
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Cloud (PostgreSQL 15+)                │
│        - Row Level Security (RLS) on all tables             │
│        - Atomic lease acquisition stored procedures (RPC)   │
│        - Encrypted session token storage                    │
│        - Health check Edge Function                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Secrets & Environment Variables

### Cloudflare Worker (`laap-api`)
Configure these secrets via `npx wrangler secret put`:

| Secret Name | Purpose |
| :--- | :--- |
| `LAAP_WORKER_SUPABASE_ANON_KEY` | Public Supabase anon key for client-scoped operations. |
| `LAAP_WORKER_SUPABASE_SERVICE_ROLE_KEY` | High-privilege key used exclusively server-side for lease RPCs. |
| `LAAP_WORKER_JWT_SECRET` | 32+ byte cryptographic secret for signing LAAP access tokens. |
| `LAAP_WORKER_ADMIN_PASSWORD` | Initial admin password bootstrap. |

Configure public variables in `apps/api/wrangler.toml`:
```toml
[vars]
SUPABASE_URL = "https://<project-ref>.supabase.co"
ALLOWED_ORIGIN = "https://laap-control-center.pages.dev"
```

### Cloudflare Pages (`laap-control-center`)
- **Build Command:** `npm run build`
- **Build Output Directory:** `apps/admin/dist`
- **Environment Variable:**
  - `VITE_API_BASE_URL`: Leave **empty** in production so requests go to the same-origin `/api` proxy defined in `apps/admin/public/_worker.js`.

---

## 3. Database Migration Deployment

All database migrations are maintained in `supabase/migrations/`:

```bash
# Verify pending migrations
npx supabase migration list --linked

# Push migrations to the remote database
npx supabase db push --linked
```

### Applied Migrations:
1. `20260831000000_init.sql`: Core tables, initial RLS policies, audit log triggers.
2. `20260901000000_remove_password_credential_paths.sql`: Deprecates password injection paths.
3. `20260901100000_session_token_sandboxing.sql`: Encrypted session token storage and RPCs.
4. `20260901110000_remove_telemetry_and_heartbeat.sql`: Eliminates heartbeat overhead.
5. `20260901120000_admin_lease_bypass.sql`: Allows administrators to claim leases directly.
6. `20260901121000_fix_admin_lease_role.sql`: Corrects Supabase metadata role check.

---

## 4. Pre-Deployment Verification Checklist

Before deploying changes, ensure all tests pass:

```bash
# 1. Full workspace typecheck, test, and build
npm run typecheck
npm run test
npm run build

# 2. Native Rust core tests
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml

# 3. Security audit
npm audit --omit=dev
```

---

## 5. Deployment Commands

```bash
# 1. Deploy API Worker to Cloudflare
npx wrangler deploy

# 2. Deploy Web Admin Dashboard to Cloudflare Pages
npm run build
npx wrangler pages deploy apps/admin/dist --project-name laap-control-center --branch main --commit-dirty=true

# 3. Build Native Desktop Release Bundle
npx --workspace @laap/desktop tauri build --ci
```
