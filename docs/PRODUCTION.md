# Production launch checklist

The repository is deployable in two modes:

1. **Local development:** `npm run dev` uses the SQL.js adapter and an encrypted local vault so the entire workflow runs without cloud credentials.
2. **Production:** Cloudflare Pages serves the admin UI and the Cloudflare Worker (`laap-api`) runs the Supabase-backed API. Supabase Postgres/Auth/RLS/Realtime/Edge Functions remain the source of truth. Do not deploy the SQL.js adapter as a multi-instance production API.

The Node API supports `LAAP_STORAGE_DRIVER=supabase` when all three Supabase server secrets are present. It refuses to start with the single-process local adapter in production unless you explicitly opt into that unsafe mode.

## Required environment

Set these in the deployment platform, never in git:

```text
VITE_API_BASE_URL=https://api.example.com
LAAP_JWT_SECRET=<32+ random bytes, rotated through your secret manager>
LAAP_VAULT_KEY=<32+ random bytes, separate from JWT secret>
LAAP_ADMIN_PASSWORD=<12+ character bootstrap password>
ALLOWED_ORIGIN=https://admin.example.com
ENABLE_DEMO_AUTH=false
```

For the API Worker, configure `SUPABASE_URL` as a public Worker variable and configure `LAAP_WORKER_SUPABASE_ANON_KEY`, `LAAP_WORKER_SUPABASE_SERVICE_ROLE_KEY`, `LAAP_WORKER_JWT_SECRET`, `LAAP_WORKER_VAULT_KEY`, and `LAAP_WORKER_ADMIN_PASSWORD` as encrypted Worker secrets. The service-role key must never be bundled into Vite or exposed to a browser.

Deploy the functions with the Supabase CLI after linking the project:

```bash
supabase db push
supabase functions deploy health-check --no-verify-jwt
supabase functions deploy get-launch-payload
supabase functions deploy upsert-account-credential
supabase secrets set SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
```

## Database and security gates

- Apply `supabase/migrations/20260831000000_init.sql` to a staging project first.
- Verify RLS policies with an operator JWT and an admin JWT; confirm operators cannot read other users, vault identifiers, audit logs, or unassigned accounts.
- Run concurrent lease-claim tests against Postgres, not only the local adapter.
- Configure the private `issue_device_launch_payload` RPC and Edge Function. It must verify the Ed25519 challenge, session ownership, freshness, one-time use, and Vault access before returning a device-sealed payload.
- Enable the `pg_cron` stale-session job and verify the five-minute reconnect grace behavior.
- Rotate Supabase service-role, JWT, Vault, and Tauri signing keys before production cutover.

## Deployment gates

- `npm ci`, `npm run test`, `npm run typecheck`, `npm run build`, and `npm audit --omit=dev` must pass.
- `cargo test` and `cargo clippy -- -D warnings` must pass for `apps/desktop/src-tauri` on macOS and Windows runners.
- Publish the desktop app only from signed GitHub Actions artifacts; never distribute unsigned binaries.
- Configure Cloudflare Pages with the `VITE_API_BASE_URL` value and a restrictive custom domain policy.
- Monitor `/api/health` and the Supabase health-check function; alert on stale sessions, failed lease claims, and auth error spikes.

## Explicit external dependencies

The code cannot create these on your behalf: a Supabase project, Riot account credentials, Cloudflare/GitHub secrets, Apple/Windows signing identities, or a Rust toolchain. They are the final deployment inputs after the repository checks pass.
