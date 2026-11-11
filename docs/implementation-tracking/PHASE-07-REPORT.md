# PHASE 07 REPORT — CI, Installers & Updaters

## 1. Overview
Hardened and verified the three-edition CI/CD, installer packaging, and update manifest generation pipeline. Maintained cryptographic Ed25519 signature verification across all three editions (`latest-offline.json` for Basic, `latest-studio.json` for Studio, and `latest-team.json` for Complete), ensuring bundle identity isolation, preflight safety (match in progress deferral), and fail-closed publication validation. Fixed the QA script duplicate reconstruction block.

## 2. Exact Files Inspected / Edited
- `scripts/generate-update-manifest.mjs`:
  - Extended `validateReleasePublication` to validate all three editions (`team`, `offline`, `studio`) with full advertised platform coverage (Windows NSIS x64 + macOS Universal tar.gz) and cryptographic signature checks.
- `scripts/build-edition-qa.ps1`:
  - Removed duplicate `$artifacts = @()` wipe block.
  - Added Windows PowerShell `npm.cmd` resolution.
- `apps/desktop/tests/updater.test.ts`:
  - Added deterministic unit test: `validateReleasePublication passes for three editions when studio is included`.
  - Verified 39/39 update engine tests covering semver mismatch, architecture gating, preflight match lock, signature tampering, and isolated Windows upgrade simulation.
- `.github/workflows/release-desktop.yml`:
  - Verified real 3-SKU release matrix including Studio for Windows and macOS with dedicated updater manifest generation and `.sig` clobber upload.
- `.github/workflows/test-and-lint.yml`:
  - Verified CI matrix testing all three feature builds (`basic`, `studio`, default `complete`), Playwright product test suites, and community API tests.

## 3. Original Requirement IDs Covered
| ID | Requirement / Feature | Status | Evidence |
|---|---|---|---|
| WF-057 | get_app_version | VERIFIED | `commands/updater.rs`, `updater.test.ts` |
| WF-058 | check_github_update | VERIFIED | `commands/updater.rs`, `updater.test.ts` (semver & channel verification) |
| WF-059 | get_updater_preflight_status | VERIFIED | `commands/updater.rs`, match active detection & provisioning lock |
| WF-060 | native_install_update | VERIFIED | `commands/updater.rs`, simultaneous transition lock, atomic updater |
| CI-3SKU | Three-edition CI/CD matrix | VERIFIED | `.github/workflows/release-desktop.yml`, `.github/workflows/test-and-lint.yml` |
| SignPath-Windows | Windows Authenticode signing pipeline | EXTERNAL_BLOCKER | Gated: Requires maintainer-approved SignPath API token and project slug; local isolated builds pass QA |

## 4. Tests and Verification Commands
- `npm.cmd --workspace @laap/desktop run test:updater` -> PASSED (39/39 tests passed)
- `node scripts/check-edition-isolation.mjs` -> PASSED (3/3 bundles verified)
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` -> PASSED
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --features basic` -> PASSED
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --features studio` -> PASSED

## 5. Security & Isolation Negative Tests
- Tampered payloads (single byte modification) fail Ed25519 signature checks closed.
- Cross-channel update attempts (e.g. Studio downloading Complete manifest) fail with edition mismatch errors.
- Manifest generation fails if any target platform artifact is missing or unsigned.
- Active matches in progress defer update execution to prevent match drops.

## 6. Next Phase
Advance directly to **TASK 08: Single final acceptance pass and STOP** (`QUEUE/08-FINAL-E2E-AND-STOP.md`).
