# Automatic presence, system-bar controls, and installer refresh

Status: implementation in progress on `codex/presence-tray`; Windows installer and host transport workflows passed for the initial implementation.

## Requested outcome

Users should install a visibly current LAAP, launch with Online as the default, change Online/Appear offline without opening Settings, and switch named saved accounts from the Windows notification area or macOS menu bar. The two installer images must be upright. Windows publisher warnings need a real signing strategy rather than a cosmetic workaround.

## Current evidence

- v0.4.6 has built-in presence, but its setup/enable controls live in Settings and presence is Windows-only.
- Windows certificate import and real loopback TLS validation passed in CI. The same legacy PKCS#12 identity failed import through macOS native TLS.
- Account launch safety is coordinated in React and Rust; no native tray interface is currently registered.
- The sidebar bitmap was regenerated previously. The screenshot of the header still shows inverted artwork; both images need regeneration and independent verification.
- GitHub has no configured code-signing secrets, and the Windows Tauri bundle config contains no signing command.

## Recommended design

### Presence starts ready and Online

Remove presence preparation and enable controls from Settings. Keep Riot installation detection, the persistent startup-mode choice, and path override there.

On the first launch after this update, automatically prepare and validate the local presence certificate, then apply the saved startup preference (Online by default). Use a one-time migration marker so an explicit subsequent offline choice is not reset by every refresh. Preserve that choice for subsequent account switches in the same app session. The saved startup preference defaults to Online for new and upgraded settings. On each fresh app session LAAP applies that startup preference; users can choose Appear offline.

Show a compact status in the main window and the system-bar menu: Preparing, Online, Appear offline, Waiting for chat, or Setup failed. The startup preference in Settings and the active session mode remain distinguishable; saving the startup preference does not change the current session. Never claim that offline visibility is active before the routed connection has applied the filter.

Retry transient setup failures with bounded backoff and expose Retry from the main window/system menu. If automatic setup fails, explain the failure. Permit an explicit normal Online launch so certificate/DNS outages cannot brick account access; do not silently perform an offline-requested launch without filtering.

A client already running when LAAP starts needs an explicit guarded restart to route chat. Do not automatically kill or restart a live client during application initialization.

Automatic setup now makes deliberate certificate/DNS requests on first use even in Offline Edition. The webview's CSP and cloud-auth/update gates remain distinct from native presence networking. Document this product behavior clearly.

### Windows tray and macOS menu bar

Create a native system-bar icon using the existing LAAP game/launcher mark. Windows uses a colored icon; macOS uses a crisp template silhouette that stays legible in light/dark menu bars. Keep the Dock/taskbar application icon consistent.

Menu contents:

- Open LAAP.
- Active account name and actual launcher/presence state.
- Online / Appear offline, with checked selection and disabled state while changing.
- Saved Accounts submenu containing real local profile names and regions. Mark the current managed profile. No fabricated accounts.
- Stop Riot.
- Retry setup when needed.
- Quit LAAP.

Clicking an account means switch to it. All actions route through shared orchestration, preserving process guards, operation locking, startup tracking, session refresh requirements, and actionable errors. An active match opens/focuses the main window for the existing confirmation before any termination. Duplicate clicks cannot enqueue repeated switches. Missing/expired logins open the existing Sign in again flow.

Refresh the menu after profile changes and launch/stop/presence changes. Native commands and application events must also work when the main window is hidden. Do not rely on a destroyed React tree for tray operation.

Saved local profiles are the initial account-switch scope. Team leases remain accessible through Open LAAP; do not bypass cloud lease ownership or authorization through a local tray shortcut.

### Background lifecycle

Closing the main window hides it to the system bar once tray initialization succeeds. It does not destroy the webview or chat proxy. Open LAAP restores and focuses it.

Quit must release/stop managed clients safely before disposing a presence proxy that those clients need. A running match receives the existing explicit exit confirmation. Cancel preserves the game and background app. If native tray initialization fails, retain a visible window and explain the failure; never hide the only usable controls.

### macOS presence transport

Enable macOS only after proving certificate parsing and a real trusted loopback handshake there. Replace the platform-specific PKCS#12 import with portable identity parsing and a common TLS transport, retaining normal hostname/chain/expiry validation for the public identity and upstream Riot connections.

A viable implementation is PKCS#12 parsing/conversion using a maintained library with the required legacy cipher support, feeding certificates and key into rustls/tokio-rustls. Resolve the dependency choice during implementation after a narrowly scoped certificate-import/handshake test. No global trust-store changes, self-signed fallback, or disabled TLS checks.

The native app must be able to route Riot chat on both platforms. Tests of identity parsing and proxy startup do not substitute for authenticated Riot-client behavior; report that manual verification limitation.

### Installer artwork

Replace the obsolete shield, checkmark, OPERATOR TOOL, and HEX-FAST SWITCH composition with a clean LAAP mark, navy/gold treatment, upright typography, and a short account-launcher descriptor. Use the existing branding rather than a new unrelated logo.

Regenerate sidebar (164×314) and header (150×57) from reviewed SVG/vector sources. Encode as uncompressed 24-bit BMP with verified row orientation. Round-trip decode each bitmap and inspect the resulting image. Verify both pages in an actual Windows NSIS installer, including the already-installed page. Both Team and Offline configs use the corrected assets.

### Windows signing and SmartScreen

Use a trusted publisher signing identity and timestamp the application/EXE/MSI artifacts. Add conditional signing support to release CI and verify signatures on Windows. Support Microsoft Artifact Signing or a user-selected compatible signing provider; do not invent credentials or purchase enrollment automatically.

Real signing requires the user's signing account/certificate credentials, which are currently unavailable. A self-signed certificate does not resolve public SmartScreen reputation. Even a trusted signature may still show a warning while reputation is new. Microsoft Store distribution is a separate publishing path, not part of this change.

Implement and validate unsigned builds while clearly reporting signing as pending until credentials are supplied. Never claim the warning is eliminated from an unsigned release.

## Alternatives considered

1. Keep opt-in setup in Settings: simplest, but contradicts the requested first-launch experience.
2. Open the main window for every tray action: minimal native work but does not provide direct presence/account control.
3. Recommended: native menu plus shared orchestration, automatic setup, and Online session default. More integration work, but delivers the requested workflow without duplicating unsafe launch paths.

## Verification requirements

- First-launch preparation, one-time preference migration, Online session default, failed setup/retry, no silent offline fallback.
- Real TLS identity import and loopback handshake on Windows and macOS.
- Fragmented XMPP filtering, original Online replay, directed lobby/chat preservation.
- Tray account-menu refresh, profile selection by stable ID, duplicate-click protection, matching launch/stop state, and main-window focus for match consent.
- Hidden-window operation, restore, guarded quit, canceled quit, and tray-init failure handling.
- Both frontend edition builds; native checks/tests on Windows/macOS; browser interaction tests.
- Decoded bitmap previews and actual Windows installer page screenshots; verify publisher signatures if credentials become available.

## Boundaries and delivery

No new release until implementation and required automated checks finish. The existing v0.4.6 remains available during the work. A later release report must distinguish CI evidence from live authenticated Riot tests and unsigned from signed installers.

## Sources

- Microsoft SmartScreen guidance: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- Tauri native tray documentation: https://v2.tauri.app/learn/system-tray/
- Existing repository presence/installation guide: docs/riot-installation-and-presence.md
