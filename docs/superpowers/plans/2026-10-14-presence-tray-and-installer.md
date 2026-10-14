# Automatic Presence and System-Bar Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if explicitly selected by the user. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare presence automatically, start Online, expose presence/account switching through a Windows tray and macOS menu-bar icon, and refresh the Windows installer artwork.

**Architecture:** Keep shared account orchestration in the current React/native operation layers. Native tray menus emit typed intents to the retained webview; all launch/stop/quit requests use existing safety guards. A portable identity/TLS layer supports both host platforms without weakening certificate checks.

**Tech Stack:** Tauri v2 native menus/tray, Rust, React/TypeScript, tokio-rustls, portable PKCS#12 parsing with legacy cipher support, SVG and uncompressed 24-bit BMP assets.

**Spec:** `docs/superpowers/specs/2026-10-14-presence-tray-and-installer-design.md`

## Global Constraints

- Initial startup preference is Online. Persist the user-selected startup presence separately from the live session mode; changing the preference does not alter the current session.
- Presence setup happens automatically outside Settings; explicit setup failure remains visible.
- No silent normal launch when the user requested offline filtering.
- Both Windows and macOS need a real certificate-import/loopback-handshake test before enabling presence there.
- Native tray account scope is saved local profiles; cloud leases remain in the main app.
- Match confirmation, cross-process locks and duplicate-click protection remain enforced.
- Closing the window hides it only after tray initialization succeeds.
- Do not modify system trust roots or disable hostname/chain validation.
- No unsigned release may claim to resolve SmartScreen reputation warnings.
- A saved cloud lease must be released during tray Quit even when the Team view is unmounted. Sign-in provisioning must remain cancellable from Quit.

## Review Focus

1. Certificate-provider outage must not brick normal Online launch; offline fallback must remain explicit.
2. A running match must not stop from a tray click without the existing confirmation.
3. A deleted/renamed profile must not leave a tray entry that launches the wrong account.
4. Closing or quitting during provisioning must preserve/cancel owned work correctly.
5. Imported old settings default the new startup preference to Online; users can explicitly choose Offline in Settings.

## Task 1: Portable identity and TLS transport

**Files:** Create `apps/desktop/src-tauri/src/presence_identity.rs`; modify `presence_proxy.rs`, `presence.rs`, `Cargo.toml`, `lib.rs`, and `.github/workflows/verify-presence.yml` under `apps/desktop/src-tauri`/repo workflow path.

**Interfaces:** `presence_identity::load(bytes: &[u8]) -> Result<ChatIdentity, String>`; `ChatIdentity` contains a verified server certificate chain and private key usable by tokio-rustls. `presence_identity::validate(&ChatIdentity) -> Result<(), String>` performs a trusted local handshake. `presence_proxy::start(identity: ChatIdentity, mode: PresenceMode)` retains its current proxy lifecycle contract.

- [ ] Add failing tests for malformed/expired/wrong-host identity rejection and preservation of upstream TLS verification.
- [ ] Run the failures, then select a parser that supports the public identity's RC2/3DES PKCS#12 encoding. First prove parsing plus a local trusted handshake on macOS; use OpenSSL-backed conversion only if its legacy-provider path works on both platforms. Do not enable macOS UI before this probe passes.
- [ ] Replace native platform identity import with the shared `ChatIdentity` transport. Load system trust roots and verify `deceive-localhost.molenzwiebel.xyz` for the local chain; verify each upstream Riot hostname normally.
- [ ] Expand the public-certificate workflow to Windows/macOS, retaining the ignored explicit network contract and normal offline unit tests.
- [ ] Run `cargo check --locked`, `cargo test --locked`, and the explicit certificate contract on both hosts; commit only after the transport contract succeeds.

## Task 2: Automatic preparation and Online default

**Files:** Modify native `launcher_settings.rs`, `presence.rs`; frontend `src/hooks/useLauncher.ts`, `shared/ui/LauncherSettingsPanel.tsx`, `PresenceControls.tsx`; test `tests/ui/launcher.spec.ts`.

**Interfaces:** `initialize_presence() -> Result<PresenceStatus, String>` is single-flight and applies the saved startup preference (Online by default). `ensure_presence_ready() -> Result<(), String>` prepares cached identity before routed launch. Add `setup_state` (`preparing`, `ready`, `failed`) to status. Keep `set_presence_mode`/`retry_presence` commands.

- [ ] Add failing tests: old disabled/offline settings initialize Online; automatic setup runs once; a user mode choice is not reset by polling; a provider outage gives visible Retry and explicit normal Online launch; offline-requested launch does not silently bypass filtering.
- [ ] Introduce a migration marker for old opt-in preferences and use session state for the fresh-app Online default. Preserve the path override and current session choice across account switches.
- [ ] Invoke initialization at app startup, with bounded retry delays of 2, 5 and 15 seconds, single-flight ownership and visible state. A cached valid identity avoids downloading again.
- [ ] Remove setup/enable controls from Settings. Place status/retry and mode choice in the header/banner. Add an explicit Launch Online action only when setup failure blocks an Online launch; it must not imply filtering is active.
- [ ] Do not restart an already running Riot client at startup. Offer the existing guarded restart only after user action.
- [ ] Run native settings/status tests and `npm --workspace @laap/desktop run test:ui`; commit the automatic startup flow.

## Task 3: Shared system-bar action routing

**Files:** Create native `src/tray.rs`; modify `src/lib.rs`, `Cargo.toml`; create frontend `src/hooks/useTrayActions.ts`; modify `App.tsx`, `PersonalRosterView.tsx`, `useLauncher.ts`, `RiotOperations.tsx`; add `tests/ui/tray.spec.ts`.

**Interfaces:** Enable Tauri's `tray-icon` feature. `tray::setup(&AppHandle) -> Result<(), String>` creates native tray/menu-bar controls. `tray::refresh(&AppHandle, TraySnapshot) -> Result<(), String>` replaces real account/status entries. `TrayIntent` is a serializable enum: `Open`, `SelectPresence { mode }`, `SwitchAccount { id }`, `StopRiot`, `RetrySetup`, `Quit`.

- [ ] Add failing UI tests that typed tray intents switch by stable account ID, refresh after rename/delete, reject missing profiles, block duplicate switches, focus the window for match consent, and open Sign in again when session material is missing.
- [ ] Use the existing LAAP mark for Windows and a new template silhouette derived from it for macOS. Build native menus on the main thread.
- [ ] Retain the webview when hidden. Emit tray intents to its registered listener; consume them using the same `launchAccount`, `operations.run`, presence commands and notification/error paths as main-window actions.
- [ ] Build menu entries from `LocalAccountSummary`; include account name/region, active-profile check, actual startup/presence state, Online/Appear offline, Stop Riot, Open LAAP, conditional Retry and Quit. Do not expose cloud launches without lease authorization.
- [ ] Refresh menus after load/edit/delete/launch/stop/presence changes. Disable mutations while an owned operation is active; native locks remain the final enforcement.
- [ ] Run Windows/macOS native tray creation smoke checks and UI intent tests; commit the menu integration.

## Task 4: Background close and guarded quit

**Files:** Modify native `lib.rs`, `tray.rs`; frontend `useTrayActions.ts`, `RiotOperations.tsx`, `shared/hooks/useNativeClose.ts`.

**Interfaces:** `request_quit` uses the operation coordinator, cancels owned provisioning where appropriate, stops managed Riot processes and proxy, releases active cloud leases through their current workflow, then permits `AppHandle::exit`. Explicit exit is tracked by native state; regular close hides the window only when tray initialization succeeded.

- [ ] Add failing tests for close-to-tray with retained pending work, Open restoring the window, canceled quit preserving a live match, provisioning cancellation before quit, and tray-init failure retaining a usable visible window.
- [ ] Replace existing keep-open close prevention with hide/restore lifecycle. Avoid hiding a match confirmation or an error that requires user attention.
- [ ] Route Quit through one shared guarded flow; prevent duplicate quit/launch actions. Dispose chat/config listeners only after the clients using them have stopped.
- [ ] Run lifecycle UI tests and native listener cleanup tests on both hosts; commit the background lifecycle.

## Task 5: Current, upright installer art

**Files:** Modify `src-tauri/icons/nsis-sidebar.svg`, `nsis-header.svg`, and both `.bmp` outputs; update docs images. Add a repeatable asset-generation script under `scripts/` that does not require generating new AI artwork.

- [ ] Regenerate the two images from reviewed vector sources, with the existing LAAP mark, navy/gold style, upright text and a concise account-launcher descriptor. Remove the obsolete shield/checkmark slogans.
- [ ] Encode uncompressed 24-bit BMP at exactly 164×314 and 150×57. Decode both outputs with a second reader and compare orientation/dimensions against SVG previews.
- [ ] Build both Windows NSIS editions and obtain screenshots of Welcome and Already Installed pages on an actual Windows test environment. Fix any header scaling/orientation issues before reporting completion.
- [ ] Save reviewed previews and the generation command; commit assets and documentation. Do not add implementation-mirroring unit tests for static images.

## Task 6: Signing preparation and delivery

**Files:** Modify `.github/workflows/release-desktop.yml`, native bundle config only as required by the selected provider, `docs/PRODUCTION.md`, and verification/user guides.

- [ ] Ask which trusted signing provider/account is available; do not request private keys in chat. With no signing identity, document the unsigned status and leave actual signing blocked without blocking the functional work.
- [ ] Add a conditional, credential-backed signing step for the chosen provider, with SHA-256 signatures and trusted timestamping on application/installer files. Verify `Get-AuthenticodeSignature` on Windows before publishing a signed claim.
- [ ] State accurately that Security Intelligence submissions are for detection review and do not guarantee consumer SmartScreen reputation clearance. Do not file an antivirus false-positive report for a screenshot containing only an unknown-reputation warning.
- [ ] Run both edition frontend builds, Windows/macOS native checks/tests, all UI tests, public certificate transport checks, and installer visual QA. Update docs with automated versus live Riot verification limits.
- [ ] Present the resulting changes and any signing/manual-validation limitations. Release a new version only when explicitly requested or within the current authorized release instruction; never move a published tag.

## Execution choice

Recommended: native execution in this chat, since the transport, initialization and tray lifecycle share state and interfaces. Complete each task and its checks in dependency order. User review of this plan and execution-method selection precede product-code changes.
