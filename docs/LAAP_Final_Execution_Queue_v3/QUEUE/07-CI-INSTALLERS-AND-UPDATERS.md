# TASK 07 — Integrate the real 3-edition signing, CI, install and update pipeline

## Confirmed gap at baseline

Current `main` `.github/workflows/release-desktop.yml` only builds/publishes previous Team (now Complete identity) and Offline (now Basic identity); Studio is absent. Current `.github/workflows/test-and-lint.yml` does not fully require the independent three-SKU and community integration matrix. Existing Python catalog seed and QA PowerShell scripts are local but not a release proof. `scripts/build-edition-qa.ps1` has a duplicate `$artifacts = @()` reconstruction block worth reviewing for artifact correctness.

## Do now

1. Apply all release workflow edits to the REAL `.github/workflows/release-desktop.yml`, not a patch file; add Studio builds for Windows and macOS (where supported), with distinct app ID and updater feed. Retain Basic old `com.laap.offline`/`latest-offline.json` and Complete transitional `com.laaP.desktop`/`latest-team.json`; don't silently change public trust keys. Check all bundle names, app data identities, installer upgrade codes, windows target arch and macOS notarization.
2. Extend Tauri manifest generation to team/offline/studio with exact edition artifact identity and signed payload verification. Verify the actual final bytes after SignPath/codesigning and the correct matching `.sig`, correct version/platform/HTTPS URL, verified reproducible source and no fallback to unsigned installers. Set publication job to fail closed until all three verified manifests and all required advertised platforms exist.
3. Coordinate SignPath setup: new Studio product/installer artifact inventory and vendor approval are external if unavailable. Do not silently use Team installer signatures for a different SKU. Keep any unapproved artifact as debug-only. Protect signing secrets and public key migration.
4. Implement required CI matrix for `basic`, `studio`, `complete` on Windows/macOS; run cargo checks/tests with appropriate `--no-default-features` + feature flags where needed, all frontend flavors, bundle isolation, product Playwright suites, real community loopback integration, updater signature tests, archive fuzz/negative tests, lint/format, and full QA report. CI must fail when a product fails.
5. Test real installer upgrades in safe isolated VMs: previous installed Basic→new Basic and former Team→Complete preserving vault, profile data, OS-keychain and update trust; fresh Studio install→signed Studio update and uninstall/reinstall with opt-in data retention. Verify startup, click paths, revision. Unit-signed fake PE files do not prove installers. Mac signing/notarization and signed native upgrade smoke where a macOS host exists.
6. Add step-by-step scripts to obtain and report missing external credentials without committing secrets or sending them to logs. No production publish/push beyond normal authorized repo code workflow; do not publish GitHub release or call payments without final user approval.

## Acceptance

- Real three-SKU pipeline in active YAML; no 'workflow edits only local' claim.
- Signed final artifacts and manifest integrity for every SKU; install/upgrade tests and regression screenshots with exact host/OS.
- Studio update button only enabled when installable signed feed is actually configured and verified.
- In absence of signing keys, SignPath scope, macOS host or action privileges: deterministic isolated tests green, external blocker reported with exact action, release remains gated.
