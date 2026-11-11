**Edition scope v2.0:** This entire NEW feature family is for **LAAP Studio and LAAP Complete only**; it is NOT part of **LAAP Basic**. Basic remains the current local-account launcher. Where this document refers to an existing local account/preset binding, that extension applies **only in Complete**, not Studio. Online Studio services may remain available with appropriate consent, without remote Riot-account storage.

# Feature Spec — Gameflow, Match Notices, Profile Tools, Automation and TFT

## Why this module is separate

Wildflover markets auto-accept, auto-ban, auto-pick, random skin, client profile icon/background and TFT looks. The dossier includes `lcu_automation_set_config`, `lcu_request`, `team_overlay_*`, `match_notice_*`. Rose features read-only champion selection, selection wheel, historic/random, multiple queue modes. Riot's integrity policy may disallow automated competitive actions; they are **not default product features**.

## Ship-capable, low-risk features first

- Read-only LCU health diagnostics and phase indicator (when opt-in), backed by event subscription with backoff and rate limits.
- Client install path discovery and manually selected fallback.
- User-visible ready-check notification (manual action remains in official client), champion-select display and optional skin/mod suggestion without automation.
- Profile background and icon preferences in LAAP, with apply only via current approved and user-consented client mechanisms. Preserve existing profile icon sync.
- Per-champion random/history **selection preference**, not automatic unlocking/applying of paid skins.
- TFT metadata and preview features; actual in-game modification gated.

## Policy-gated features (track, don't deploy until approved)

- Auto accept, auto ban, auto pick, auto lock, automatic queue actions, automatic client input, pregame strategic recommendations that affect fairness.
- Live competitive overlay showing opponent stats, matchup suggestions, rank/restrictions or private information.
- Any client endpoint write beyond narrowly allowed/approved API use.
- Full in-match skin substitution and TFT appearance mutation without expressly permitted integration.

## If legal approval for a narrow automation arrives

- Require per-action explicit opt-in and visible control, explain game/version limitations, reject locked or changed champion states.
- Avoid external process injection and memory access; use documented authorized client service only.
- Never make selections that contradict teammate intent, never make choices in a contested way based on hidden info, offer disabled-on-patch default, and test against Riot's current policy wording.
- Do not ship automation by default merely because Wildflover offers it.

## Client profile tools

- Show current profile icon/background with permissions; preview proposed image before apply.
- Separate local LAAP avatar/preset vs Riot-client actual profile icon. Never imply local customization changed Riot servers when it did not.
- If client rejects a change, show real API error and safe rollback; no repeated retries/spam.

## Overlay user experience

- Prefer a lightweight in-client plugin panel only when approved; no full-screen invasive overlays. During game, limit to outside-game notices and diagnostics, never show unfair tactical intel.
- Hotkeys implemented using supported Tauri/global-hotkey plugin with explicit opt-in and conflicts; no global keylogger behavior.
- Translate strings; no frequent flashes, no forced focus stealing; respect OS accessibility and performance mode.

## Tests

- Gameflow synthetic states and real-client opt-in test when available; out-of-order events and client restart.
- Switch account during lobby/ChampSelect must remain guarded; no session leakage.
- All gated automation paths inaccessible in production build and disabled in compiled capabilities.
- Read-only observer must not send LCU lockfile password/credentials to remote services.
