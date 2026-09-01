# LAAP agent handoff

This is the current operating guide for another coding agent. Never paste or
commit Supabase API keys, database passwords, Cloudflare tokens, LAAP secrets,
or Riot credentials. The project intentionally has no Riot-password flow.

## Repository

- Workspace: `/Volumes/Shared/PW/laap`
- Branch: `main`
- Remote: `https://github.com/Kingof3O/laap.git`
- The local branch contains commits ahead of `origin/main`. Review with
  `git log origin/main..HEAD` and push only when explicitly requested:
  `git push origin main`.
- Keep generated files out of Git: `.env*` (except examples), `dist/`,
  `.data/`, `.toolchains/`, `.artifacts/`, `supabase/.temp/`, Cargo target
  directories, and macOS `._*` metadata.

## Live deployment

- Admin Pages: `https://laap-control-center.pages.dev`
- API Worker: `https://laap-api.hussiensalah100.workers.dev`
- Supabase project ref: `rlhkkszeagixqmvtmknx`
- Cloudflare Pages project: `laap-control-center`
- Cloudflare Worker name: `laap-api`

The Pages app uses a same-origin `/api` proxy in
`apps/admin/public/_worker.js`. Build the admin app with an empty
`VITE_API_BASE_URL` for Pages; the proxy forwards `/api` to the API Worker.

## Architecture and security contract

- `apps/admin`: React/Vite/Tailwind dark-only control center.
- `apps/api`: Node HTTP API, local SQL.js adapter for development, and
  Supabase service adapter for production.
- `apps/api/worker.ts` + `wrangler.toml`: Cloudflare Worker entrypoint using
  Cloudflare Node HTTP compatibility.
- `apps/desktop`: Tauri React UI plus Rust device identity, lease client,
  native Riot launcher, and process monitor.
- `supabase/`: RLS schema, lease RPCs, stale-session cron, and health check.

Keep these invariants:

1. LAAP never accepts, stores, injects, logs, or transmits Riot passwords.
2. Never read Riot lockfile credentials, cookies, tokens, browser storage, or
   process memory.
3. Riot Client is launched normally with only
   `--launch-product=league_of_legends --launch-patchline=live`.
4. Ed25519 private material stays in the native OS keychain. Only the public
   key and signed lease challenge cross the API boundary.
5. Operators see only assigned accounts and their own devices. Users,
   assignments, audit, account creation, and all credential-like operations
   are administrator-only.
6. Riot process presence is not authentication proof. `Authenticated` and
   `Account verified` are reserved for a future supported Riot signal and are
   not emitted today.

## Supabase state

- Migration `20260831000000_init.sql` is applied and recorded remotely.
- Migration `20260901000000_remove_password_credential_paths.sql` is applied;
  it revokes the old password/Vault RPC privileges.
- Only `health-check` remains deployed. The old `get-launch-payload` and
  `upsert-account-credential` Edge Functions were deleted.
- Do not re-add those functions or the old password credential routes.
- Riot RSO is optional and requires an approved Riot production application
  and RSO client before any OAuth code is enabled.

## Tauri behavior

On sign-in, Tauri requests a short-lived LAAP bearer with
`/api/auth/login?client=tauri`; it stores that token only in process memory.
It registers the keychain public key, loads assigned accounts, acquires a
signed lease, opens Riot Client, and sends heartbeats. It releases the lease
on logout/process exit; the backend reaper handles crashes and stale sessions.

Runtime states are explicit: `Lease acquired`, `Riot Client starting`,
`Waiting for Riot login`, `League running`, `Lease lost`, and
`Logged out / Riot client closed`. The monitor never claims which Riot account
is signed in because Riot exposes no documented supported native signal for
that identity.

## Verification commands

Node:

```bash
cd /Volumes/Shared/PW/laap
npm run typecheck
npm run test
npm run build
npm audit --omit=dev
```

Rust/Tauri (use temporary Cargo registry/target paths because the shared macOS
volume creates AppleDouble metadata in generated files):

```bash
cd /Volumes/Shared/PW/laap
export RUSTUP_HOME=/Volumes/Shared/PW/laap/.toolchains/rustup
export CARGO_HOME=/tmp/laap-cargo-home-native
export CARGO_TARGET_DIR=/tmp/laap-cargo-target-native
export PATH=/Volumes/Shared/PW/laap/.toolchains/cargo/bin:$PATH
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```

Build a local macOS installer from `apps/desktop`:

```bash
npx tauri build --ci
```

The local DMG is written to `.artifacts/` when copied by the setup workflow.
It is ad-hoc signed for local testing, not Developer ID signed/notarized.

## Deployment commands

Supabase CLI credentials are stored by `supabase login`; database commands may
prompt for the database password. Never put that password in Git or chat.

```bash
cd /Volumes/Shared/PW/laap
npx supabase migration list --linked
npx supabase db push --linked
npx wrangler deploy
npm run build
npx wrangler pages deploy apps/admin/dist --project-name laap-control-center --branch main --commit-dirty=true
```

For a Pages deployment, build the admin bundle with `VITE_API_BASE_URL` empty
so the same-origin proxy is included. The Worker secrets are encrypted
Cloudflare secrets named `LAAP_WORKER_SUPABASE_ANON_KEY`,
`LAAP_WORKER_SUPABASE_SERVICE_ROLE_KEY`, `LAAP_WORKER_JWT_SECRET`,
`LAAP_WORKER_VAULT_KEY`, and `LAAP_WORKER_ADMIN_PASSWORD`; values must never
appear in command output or source control.

## Known limitations

- No supported API currently lets LAAP prove which Riot account is logged into
  the native client without using private/unsupported client interfaces.
- Therefore wrong-account detection and `Account verified` cannot be safely
  implemented yet; do not substitute lockfile scraping or manual claims.
- A production Tauri release needs Developer ID/Windows signing, notarization,
  updater configuration, and CI release secrets. Local builds are only for
  testing.
