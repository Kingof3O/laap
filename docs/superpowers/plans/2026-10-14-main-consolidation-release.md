# Main Consolidation and Release Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate every existing branch into main, retain working account features, update dependencies, remove integrated branches, and publish a verified release.

**Architecture:** Merge existing branch histories into main. Resolve dependency migrations against the real application and keep SignPath disabled until approval and credentials exist.

**Tech Stack:** Rust/Tauri, React/TypeScript, npm workspaces, GitHub Actions.

**Spec:** User request to merge all branches, delete them, build and release.

## Global Constraints
- Preserve existing saved vaults and settings.
- Preserve every branch's changes before deleting its reference.
- Do not replace published release assets or tags.
- Windows signing remains pending SignPath approval.

## Review Focus
- Major dependency changes must compile on Windows and macOS.
- Persisted vault encryption and keychain access must remain compatible.
- Admin styling must survive Tailwind migration.
- Release uploads must remain draft-only until every required build succeeds.
- Tray switching must continue to release cloud leases and guard active matches.

### Task 1: Integrate feature histories
- [x] Fetch current remote refs and merge SignPath and presence branches into main.
- [x] Resolve workflows and policy documentation without losing either branch's behavior.

### Task 2: Integrate dependency branches
- [x] Merge all Dependabot branches; regenerate conflicted lock files from the combined manifests.
- [x] Update application APIs/configuration for major upgrades.
- [x] Run monorepo build/type checks/tests and desktop offline/UI/sorting/lease tests.
- [x] Run cargo check/test and address migration failures.

### Task 3: Publish release and clean branches
- [x] Bump all desktop release versions to 0.4.7 and update release documentation.
- [x] Review final integration, push main and verify Windows/macOS CI.
- [x] Publish a new version tag and wait for all release builds and assets.
- [x] Delete only branches whose changes are included in main; verify only main remains.
