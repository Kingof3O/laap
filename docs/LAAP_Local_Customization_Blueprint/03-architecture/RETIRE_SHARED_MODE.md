# Retiring Shared/Team Mode without Losing User Data

## Objective

Remove cloud Riot-account sharing, user/device Team authorization, admin assignment, and lease UX from active products. Preserve local Riot-account management and offer *separate* optional online community capabilities. Do not remove cloud tables or production accounts blindly.

## Exact before → after

**Before:** `App.tsx` has `appMode='local'|'team'`; Team navigation authenticates through `features/auth`, uses `features/team-vault` and remote API (`apps/api`) to get shared vault profiles, leases and heartbeat.

**After:** desktop flavor determines whether vault code is compiled; local accounts always handled by existing `commands/local_accounts.rs`. No UI, IPC, API request, entitlement or background job can acquire a shared Riot-account lease. New party rooms have a separate identity and use no game session material.

## Reversible deprecation stages

### Stage 0 — Inventory and freeze
- Inventory live Team accounts, assignments, active leases, users and cloud encrypted session blobs; record owners and retention terms without disclosing secrets in logs.
- Produce encrypted access-controlled backups with test-verified restore; no automatic export to any personal local vault.
- Announce sunset timing and provide migration path for users' own personal profiles. Confirm user legal rights to data and session material.

### Stage 1 — Client compatibility layer
- Introduce `LegacyTeamMigrationView` in currently compatible Complete (`com.laaP.desktop`) builds.
- Display `Team mode retiring` and permit read-only **authorized** account metadata export (names/regions/notes) with explicit admin/user permission.
- For users with authorized personal account ownership, offer an explicit normal Riot re-login into Local; do **not** silently import shared session blobs.
- Ensure any active lease is released via old route. Store receipts/backup references without tokens.
- Keep old Team API functional only for migration for defined period. No new Team accounts/leases in new app.

### Stage 2 — Clean cutover
- Remove Team auth/lease/assignment tabs, hooks, permission checks, API calls and admin routes from new supported binaries; preserve migration tooling in separate legacy branch/tool with access controls.
- Verify session recovery, tray actions, updater and presence unaffected by the removal.
- Disallow local files referencing cloud lease identifiers as live accounts.

### Stage 3 — Server decommission after authorization
- Stop new sessions. Expire leases, revoke tokens, document deletion requests, export audit records per retention policy and maintain required security logs only.
- Shut down Team API and admin dashboard after migration completion/notice; remove abandoned infrastructure, secrets and DNS via controlled ops runbook.
- Drop Supabase tables only as a separate authorized irreversible migration, with recoverable backups tested.
- Update website, downloads, product description and policies to say no account sharing.

## Code ownership mapping

- `features/team-vault/*` → remove in new UI after migration proof; archive import support in a small `legacy-team` feature.
- `features/auth/*`, `features/device/*` → eliminate Team auth paths; optional Discord/commerce sign-in must be separate, never masquerade as Riot login.
- `apps/api/src/routes/{accounts,leases,auth,devices,admin}.routes.ts` → deprecate Team API; new community API must be structurally independent.
- `apps/admin` → retire Team dashboard, create new moderation admin only if marketplace activated; no shared code with old account session administration except generic UI primitives with licenses.
- `supabase/migrations` → preserve until explicit retention/deletion authorization. Use new namespace for community features.
- `packages/types` / `packages/validation` → keep legacy types only in migration package, remove from live frontend domain.

## Upgrade and signing identity safeguards

- Keep `com.laap.offline`, its app-data root and pinned updater trust chain intact for Basic (current Offline). Do not add Studio feature families to Basic.
- Keep `com.laaP.desktop` on a signed transition channel; old Team clients must discover migration update via their existing endpoint.
- Introduce `com.laap.studio` fresh; never share a storage root with account vault. **All new customization/party/marketplace/creator features belong in Studio and Complete only.**
- A new branding/name is not authorization to rotate signing keys. Test old-installed-version → migrated-new-version on each supported OS.

## Mandatory migration tests

1. Snapshot old vault with encrypted blobs; new launch preserves bytes and decrypts under the same user OS keychain.
2. Legacy Team client can read instructions and release existing lease; no new cloud session acquisition after cutover.
3. No new network request sends `session_blob`, Riot auth token, PUUID or cached client lockfile secrets to Community API.
4. Invalid/unauthorized Team metadata migration refused; no secrets in export.
5. Both Basic and Complete launch after server fully removed, without Team login prompt; Basic has no Studio features. Studio launches without vault services.
6. Corrupted or partial upgrade safely rolls back; backups remain intact.
7. Product update manifests cannot cross-install Studio vs Local vs Complete.
