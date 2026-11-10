# LAAP V2.2 Titanium Aurora — implementation and verification

Baseline: `d87aa926751546725c8014394a0c40034ca1cd1d`. Changes are local and have not been pushed or published.

## Implementation

- Added `src/styles/titanium.css`, with graphite, smoked titanium, opal mint and ice roles, and applied it to the shell, cards, settings, dialogs and controls. Existing Sora and Manrope assets remain local.
- Extracted `ProfileInspector.tsx`. The grid has a persisted Show/Hide Details control, a close action, and a selected-account view of available fields. Selection falls back to a visible account when a profile is filtered or deleted. Shared accounts only show fields actually provided by the Team API.
- Replaced the presence select with a header popover. Requested and applied modes have distinct labels; restart and failure states retain explicit guarded actions. The existing native commands and active-match guard are unchanged.
- Separated automatic sync from foreground sync in `useLocalAccounts.ts`. Background no-op checks no longer enter the visible syncing state; failures are surfaced and a later successful check clears the error. The compact disclosure exposes manual sync and timestamps without a full-width panel.
- Made the profile preview smaller and placed icon and sync customization inside an expandable section. The existing scroll region, footer and provisioning cancellation remain in place.
- Gated shared-account administrative menu actions to match list-view permissions. Existing updater installation remains disabled and the caller-controlled installer command remains absent.

Changed production files: `App.tsx`, `PersonalRosterView.tsx`, `useLocalAccounts.ts`, `AccountCard.tsx`, `AccountRosterDisplay.tsx`, `ProfileInspector.tsx`, `PresenceControls.tsx`, `ProfileFields.tsx`, `UpdatesSettings.tsx`, `index.css` and `styles/titanium.css`. Tests and capture scripts under `apps/desktop/tests` were updated or added. No runtime dependency was added.

## Visual review

`docs/visual-v2-2/pass-1` is the initial browser fixture render. It showed the inspector stretching to match a long roster. `pass-2` corrected that and exposed insufficient space for the advanced disclosure and a tall inspector at 960×640. `final` contains the subsequent compact layout. I inspected the 960 roster with details open and closed, presence menu and restart state, sync error and idle, Add Account and expanded customization, Appearance and Updates, plus the Team operator fixture. Captures include one, two and ten profiles, grid/list, details, presence, sync, form, settings and Team fixtures at the requested sizes; not every generated image was individually inspected. These are Chromium fixtures, not live WebView2 or Riot sessions.

## Checks executed

- Team and Offline TypeScript/Vite production builds passed. One simultaneous build attempt collided in the shared `dist` directory; the Offline build passed when rerun sequentially.
- Playwright: 23 passed, including inspector selection, persistence, filtering and deletion, manual sync error/retry, repeated background no-op polling without card movement, and error recovery. Team screenshots used a test-only operator fixture and checked that administrative menu actions were not exposed.
- Sorting: 3 passed; updater JavaScript tests: 13 passed. Rust tests: 45 passed and 3 network/certificate contract tests ignored. The updater test fixtures are not proof of a production signed install.
- Static custom-property scan found no undefined CSS variables. The no-op polling test checks a card bounding box and visible sync state; it is not a native frame-rate or memory benchmark. No objective WebView2 blur performance measurement was made.

## Remaining limitations

The full screenshot matrix was captured with test fixtures; several images were not individually reviewed. Windows WebView2, macOS, real Riot launch/switch and live presence were not verified in this pass. The pre-existing signed updater remains disabled: production signing credentials, signed edition-specific artifacts and a verified release pipeline remain necessary. No signing credential, vault, production resource, running Riot process or release was modified. No production-readiness claim is made.

## References

Research consulted [Anthropic frontend design](https://github.com/anthropics/skills/tree/main/skills/frontend-design), [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines), [Radix dropdown guidance](https://www.radix-ui.com/primitives/docs/components/dropdown-menu), [Motion](https://github.com/motiondivision/motion), [Motion Primitives](https://github.com/ibelick/motion-primitives), and [Tauri window customization](https://v2.tauri.app/learn/window-customization/). Existing React, Lucide and CSS were used; no source implementation was copied from these projects.
