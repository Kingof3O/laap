# LAAP desktop and admin hardening

Released in v0.4.3. All four Windows/macOS Team/Offline GitHub release jobs, both branch/tag test workflows, and security scans passed on 2026-10-14. Installer compilation does not establish live-client behavior.

## Implemented behavior

- Desktop roster data comes exclusively from native IPC. A bridge that has not bound is retried briefly, then produces an explicit error and an empty data set. Browser demo accounts and browser-local roster persistence are removed.
- Admin preview identities, accounts and assignments are removed. API failures are visible, and obsolete requests cannot repopulate state after logout or navigation. Account, people and assignment screens show loading/error/retry states and refresh live data.
- Quick import detects name/region/PUUID when available in Riot YAML or local token claims, then presents a review dialog. Missing metadata stays missing until the user supplies it. Token claims are informational, not trusted authentication.
- Dialog closure/unmount invalidates pending polling results and cancels only its owned provisioning ID. Rust polling never falls back to the active user's login. A private staging snapshot preserves original settings; cancellation restores originals and removes staging. Abandoned snapshots are recoverable on restart.
- Stop preserves login files. Switch serializes stop, session injection and launch, then updates the existing `last_used_at` timestamp. League and Valorant game processes require explicit exit consent. Windows sends WM_CLOSE before termination fallback; Unix sends SIGTERM. Failure to exit is actionable and prevents injection.
- Native operation locks protect against overlap inside and between LAAP instances. Provisioning holds a separate cross-process lease. A session owner marker prevents an old cloud cleanup from stopping a newer local session. Slow native IPC commands execute on blocking workers rather than the UI thread.
- Sign in again updates an existing profile's credentials in place, preserving name, region, rank, notes, favorite and creation date. Known PUUID mismatches are rejected. Missing fields in legacy profiles deserialize with defaults.
- Editing supports all profile metadata. Sorting supports names, competitive rank tier/division, last played and creation date. Arabic/Roman divisions normalize equally; unknown/unranked labels remain last in either direction. Regions are grouped geographically, including SG, TW, VN, PH, TH and ME; previously saved SEA profiles remain supported.
- Vault operations serialize the entire read/modify/write transaction using process and OS file locks. Temporary filenames are unique; replacements are atomic, including Windows replacement without deleting the destination first. Damaged records are preserved in restricted quarantine files and valid records still load. If no record is readable, the original vault is preserved and a load error is returned.
- Offline CSP uses `connect-src 'none'`. Offline code blocks API calls and skips cloud-auth/update polling. Desktop and admin fonts use system fallbacks without Google requests. Offline settings identify local storage and the optional icon/sync connections; update failures do not report success. Dialog focus/Escape management, a global ErrorBoundary and missing CSS states are implemented.

## Verification

Run from the repository root:

```sh
npm run build
npm --workspace @laap/desktop run build:offline
npm run test
npm --workspace @laap/desktop run test:sorting
npx playwright install chromium
npm --workspace @laap/desktop run test:ui
cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

On a filesystem that produces AppleDouble metadata files, use a local build cache, for example `CARGO_TARGET_DIR=/tmp/laap-desktop-cargo-target`. Playwright ignores AppleDouble files explicitly.

Verified locally on macOS:

- API/admin/desktop production builds and desktop Offline build.
- 15 API tests and the admin TypeScript check.
- 25 Rust tests, including vault corruption isolation, concurrent updates, metadata-preserving refresh, personal-login preservation, sandbox cancellation and League/Valorant match guards.
- 2 sorting tests covering hierarchy, divisions, unknown ranks in both directions, names and timestamps.
- 8 browser tests covering unavailable/delayed IPC, zero external requests in Offline, consent before Stop/Switch, backend match-detection races, focus/Escape/form reset, quick-import review, pending-poll cancellation, metadata editing, grouped region/rank choices, local image upload and cached avatars/notes after reload. Native responses are simulated only in test fixtures; production code contains no demo roster.
- An explicit public-network smoke test verified Data Dragon versions, icon catalog and an actual profile PNG using the production Rust HTTP client.
- Built artifacts contain no former pro-player fallback roster or browser roster-persistence code.

The sorting and browser checks are included in GitHub CI.

## Practical limits and manual release checks

- Live Riot authentication, a real in-progress match, and Windows UAC/elevated-client shutdown were not exercised locally. Verify on supported Windows and macOS installations; automated match tests deliberately do not terminate real games.
- Offline freshness is a conservative age hint (30 days since capture). Riot can revoke a login earlier, and expiry of an access/id token alone does not prove that a reusable refresh token is invalid. The interface says “Login saved” rather than guaranteeing successful authentication.
- A syntactically damaged entire JSON document is preserved and reported as an error. Individual malformed/decryption-failing records inside a readable array are isolated.
- Runtime npm dependency audit reports zero advisories. The full development-tool audit still reports existing Tailwind/Vitest/toolchain advisories that require separate framework upgrades; this change does not claim to eliminate those dependencies' advisories.
- No new GitHub release was published by this implementation task.
