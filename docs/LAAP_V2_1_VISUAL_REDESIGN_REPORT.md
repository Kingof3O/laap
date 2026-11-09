# LAAP V2.1 remediation report

Baseline: `5e986a8988e21f08f0dfcf42cc3d631bfa8a9e65`. This is a partial implementation, not acceptance of the full redesign contract.

## Changes
The Windows-style title controls now share the header row; filters are grouped in a disclosure; local fonts, glass card styling and missing card state selectors were added. Sort values match the real sorter, favorites are no longer prepended to account names, and appearance changes update the active roster and persist reduced motion. Riot and presence settings show their respective portions of the launcher controller instead of the entire form on every category. Offline settings expose manual update checks and update visibility. The custom native installer command, including its caller-controlled public key and executable download path, was removed. Automatic installation is disabled; the release page remains available for manual updates. The native check uses the package version and only considers a universal macOS manifest entry on macOS.

The changes are traceable with `git diff --stat` and `git diff`; new assets and this report also appear in `git status --short`. No new runtime dependency was added. Font assets came from Google Fonts and retain their bundled SIL OFL notices.

## Visual review
Browser fixtures, not production accounts or native verification, were used. `docs/visual-v2-1` contains two-account roster and General settings captures at 960×640, 1160×760 and 1440×900, plus empty, one and ten account grids, ten-account list, an account menu and all settings categories at 960×640. The first 960 capture revealed duplicate branding and a two-row toolbar; the shell and filters were revised and recaptured. Reviewed captures include the 960 roster, settings, appearance, updates, menu, list, empty and ten-account grid. The existing `docs/assets/launcher-grid.png` was reviewed as a historical visual reference; it shows the previous hero and duplicated profile content. The full requested state-by-resolution matrix, native screenshots and objective performance measurements remain outstanding.

## Verification and limitations
Team and Offline frontend production builds passed; sorting and updater JavaScript tests passed; Rust check passed; Rust tests passed with 45 passed and 3 deliberately ignored network/certificate tests. The sandboxed Rust run initially failed on temporary-file access; the unrestricted rerun passed. The Playwright suite passed 21 tests after updating tests to the new category locations and clean names. Browser mocks do not verify Windows window dragging, DPI, multi-monitor behavior, native close-to-tray or real Riot flows. macOS was not verified. A Windows NSIS debug packaging attempt failed because the existing `laap-desktop-core.exe` process held the output executable open (Windows error 5); the process was not stopped. No installer was produced by that attempt. Release workflow integration, signed Tauri updater configuration, edition-specific signed manifests, full regression tests and the complete visual matrix remain unfinished. No download or installation should be described as verified until a trusted signing key, signed artifacts and supported Tauri updater lifecycle are configured and tested.

## Changed files

- Native updater: `apps/desktop/src-tauri/src/commands/updater.rs`, `lib.rs`.
- Application state and views: `apps/desktop/src/App.tsx`, `main.tsx`, `features/personal-roster/PersonalRosterView.tsx`, `hooks/useUpdateChecker.ts`.
- Shared UI: `AccountCard.tsx`, `AccountListTable.tsx`, `ContextMenu.tsx`, `LauncherSettingsPanel.tsx`, `ProfileAvatar.tsx`, `SettingsModal.tsx`, `SubNavbar.tsx`, `UpdateModal.tsx`, `WindowTitleBar.tsx`, and the Appearance, SettingsNavRail and Updates settings components.
- Styles: `base.css`, `cards.css`, `header.css`, `tables.css`, `tokens.css`; font assets and license notices under `apps/desktop/src/assets/fonts`.
- Tests and captures: `sorting.test.ts`, `ui/desktop.spec.ts`, `ui/launcher.spec.ts`, `tests/capture-v21.mjs` and `docs/visual-v2-1/`.
- Documentation: this report and `design-system/laap-desktop/MASTER.md`.

# Final visual pass — 10 November 2026

## Implementation
For one or two profiles, the grid now shares a workspace with an inspector driven by the selected account. The inspector exposes the saved session status, last use, profile-added date, notes and the existing editor action. Larger collections keep the grid and compact list. Cards have a larger avatar frame and action, clearer rank and status treatment, and a keyboard-selectable identity. The search placeholder now fits at minimum width. The settings rail and appearance switch received a more defined material treatment; menu and dialog entrances respect reduced motion. The current pass adds `AccountRosterDisplay.tsx`, `AccountCard.tsx`, `PersonalRosterView.tsx`, `SubNavbar.tsx`, `AppearanceSettings.tsx`, `styles/obsidian.css`, `index.css`, the capture scripts, the inspector test, and an isolated packaging cache exclusion/watch rule to the changes listed above.

## Three visual reviews
- Baseline: `docs/visual-v2-1-final/before-960.png`, copied from the prior V2.1 browser fixture capture.
- Pass 1: `pass-1/` showed the new workspace at all target sizes. The 1440 screenshot showed an over-wide inspector and the settings toggle still looked like a default checkbox.
- Pass 2: `pass-2/` constrains the workspace at larger widths and styles the switch. Review of the 960 menu, edit and update states showed the capture script was recording entrance animations before they settled and that the inspector needed more profile-specific detail.
- Pass 3: `pass-3/` contains settled screenshots, including real fixture notes and the saved profile date. Inspected: 960 roster, menu, edit and update-error; 1160 ten-account list; 1440 one-account grid and update available. All screenshots are Chromium browser fixtures, not live account data or native WebView2 screenshots. The pass-3 captures cover one, two and ten profiles in grid/list at each requested size, General/Appearance/Updates, menu, add/edit and update available/error at each size.

## Verification
- Team and Offline `tsc -b && vite build` passed; final Team JS was 353.72 kB (103.88 kB gzip), CSS 58.35 kB (11.31 kB gzip), excluding separately bundled fonts. This is a bundle-size observation, not a runtime performance benchmark.
- `npm ls --workspace @laap/desktop --depth=0` passed. Sorting: 3 passed; updater JavaScript tests: 13 passed; Playwright: 22 passed, including inspector selection and actual fixture notes. Rust: 45 passed, 3 deliberately ignored network/certificate tests. Rust check passed.
- Browser computed styles and `document.fonts.check` confirmed Manrope and Sora loaded at each size; browser document width matched viewport width. `pass-3/metrics.json` captures the measurements. Initial render samples were collected while a Rust build was running (one sample was 22.8 s); they are not a valid performance comparison. No native startup, memory or frame-rate benchmark was performed.
- A static scan found no unresolved CSS custom property references. This is not proof that every class or visual state has been exhaustively audited.
- A Windows debug NSIS build was run with `CARGO_TARGET_DIR=apps/desktop/src-tauri/target-v21-package`, leaving the existing LAAP process untouched. It built an executable and NSIS installer, but the command exited with an error at updater signing: `TAURI_SIGNING_PRIVATE_KEY` was unavailable. The output is not a verified production release.

## Remaining blockers
The production signing private key and verified edition-specific signed artifacts/manifests were not available. Automatic installation remains disabled. The existing release workflow and the old patch do not constitute a verified signed-update pipeline; no empty manifests were published or represented as valid. No updated application was inspected in Windows WebView2: the pre-existing LAAP process was left running and the isolated build was not launched against the user's vault. Native drag, DPI, multi-monitor and tray behavior, macOS behavior, real Riot operations, and production update checks remain unverified in this pass. Three ignored Rust network/certificate contract tests were not run. No claim of production readiness is made.
