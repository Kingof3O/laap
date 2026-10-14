# Production operations

Checked against repository configuration on 2026-10-14. Deployment requires explicit authorization; configured URLs are not evidence that a service is currently healthy.

## Topology and configuration

The root `wrangler.toml` deploys `apps/api/worker.ts` as the `laap-api` Cloudflare Worker with Node HTTP compatibility and the Supabase adapter. Admin assets deploy to Cloudflare Pages; `apps/admin/public/_worker.js` proxies same-origin `/api` requests to the API Worker. Keep production `VITE_API_BASE_URL` empty for that proxy flow.

Worker variables in root `wrangler.toml` include `NODE_ENV`, `LAAP_STORAGE_DRIVER`, `ALLOWED_ORIGIN`, `SUPABASE_URL`, and `CF_WORKER`. Secret values belong in Cloudflare/your secret manager:

```sh
npx wrangler secret put LAAP_WORKER_SUPABASE_ANON_KEY
npx wrangler secret put LAAP_WORKER_SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put LAAP_WORKER_JWT_SECRET
npx wrangler secret put LAAP_WORKER_VAULT_KEY
```

Keep the application vault key stable for existing encrypted blobs; key rotation needs re-encryption planning. Never expose the Supabase service-role or vault key in frontend variables.

For a self-hosted Node API, see `apps/api/src/config.ts`: use `LAAP_JWT_SECRET`, `LAAP_VAULT_KEY`, `LAAP_ADMIN_PASSWORD`, and the `SUPABASE_*` variables. Production rejects default/short secrets and the default admin password. The single-process local SQLite adapter is blocked in production unless explicitly overridden; use Supabase for the hosted deployment.

## Database

Review and apply ordered files in `supabase/migrations/`:

```sh
npx supabase migration list --linked
npx supabase db push --linked
```

The latest migration is `20260904000000_production_hardening.sql`, following the initial schema, password-path retirement, session sandboxing, historical heartbeat removal, and admin lease fixes. It restores lease liveness, database-backed roles, restricted RPC access, and lifecycle constraints. Do not infer applied migration state from the repository alone.

The initial schema schedules stale cleanup with `pg_cron`; acquisition/dashboard operations also trigger cleanup. The Worker disables the Node interval reaper. Confirm the database cron job is active. Legacy `vault_secret_id` records are intentionally preserved by hardening; inventory them before any separate reviewed cleanup.

## Preflight

```sh
npm ci
npm run test
npm run typecheck
npm run build
npm --workspace @laap/desktop run build:offline
npm --workspace @laap/desktop run test:sorting
npx playwright install chromium
npm --workspace @laap/desktop run test:ui
cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
npm audit --omit=dev
```

## Deploying hosted services

Run from the repository root after authorization:

```sh
npx wrangler deploy
npm --workspace @laap/admin run build
npx wrangler pages deploy apps/admin/dist --project-name laap-control-center --branch main
```

`.github/workflows/deploy-admin.yml` is manual (`workflow_dispatch`), not an automatic deploy on every push. It uses configured Cloudflare secrets and the Pages project variable.

After deployment, verify `/api/health` and `/api/ready`, then an authenticated session/dashboard flow and an authorized read against the actual database. Liveness endpoints do not themselves probe database connectivity. Confirm Pages `/api` proxy behavior, cookie delivery, CORS for supported desktop origins, current migrations, and stale-session cleanup.

If deploying to a filesystem/server, preserve production `.env`, uploaded files, persistent/runtime storage, requested backups, storage symlinks, logs, sessions, and caches. Exclude development-only files, tests, docs/Markdown, debug captures/logs, temporary files, and unused platform binaries. Retain build dependencies if building on the server. Verify exclusions before `rsync --delete`; do not use `--delete-excluded` without explicit approval. Rebuild and verify services/routes/storage/web-server configuration afterwards.

## Desktop releases

The release workflow builds four jobs: Windows x64 Team/Offline and universal macOS Team/Offline. Push a new `v*.*.*` tag only after aligning versions in package manifests/lockfiles, Cargo manifest/lockfile, both Tauri configs, and `useUpdateChecker.ts`. Use a new version rather than moving a published tag.

For the latest Windows `.exe`/`.msi` installers and universal macOS `.dmg`/`.app.tar.gz` archives, use the [latest GitHub release](https://github.com/Kingof3O/laap/releases/latest). Artifact names include the product edition and version (for example, `LAAP.Offline_<version>_x64-setup.exe`).
The workflow creates/publishes the GitHub release and uploads assets as jobs finish; inspect all four results before declaring it complete. It writes generic release text, so finalize detailed notes after all jobs finish. If manually dispatching, select the intended version tag, not `main`. Team Edition polls GitHub releases; Offline Edition does not.

For local host/universal packaging commands and output paths, see [DEVELOPMENT.md](DEVELOPMENT.md). Installer builds do not validate live Riot authentication, real in-game stopping, or elevated Windows shutdown; see [verification limits](desktop-hardening-verification.md).
