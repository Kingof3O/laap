# TASK 04 — Complete local themes, safe gameflow and gated integration adapters

## Current state

Current theme editor saves three hex colors and bundled-font choice locally; no League client themes are applied. Current LCU gameflow command is consented manual read-only status. No supported client adapter exists. Do NOT call this Wildflover/Rose feature parity.

## Do now

1. Turn Studio theme tools into a professional LOCAL workshop: preset gallery, import/export/versioned theme packages, images/GIF/video previews as permitted, audio previews with user files and rights notices, typography, color tokens, transitions, per-surface editable layouts, size/duration bounds, asset provenance, keyboard accessibility, live preview and robust undo/reset. Local edits must function offline and not corrupt Basic's Velvet Amethyst theme.
2. Design and implement a capability-negotiated optional `ClientAppearanceAdapter` interface. It must be disabled unless actual installation, version compatibility, public documented APIs, required third-party licenses, and relevant permission/policy approval are verified. Provide adapter diagnostics and an explicit rollback/deactivation path. Do not claim a theme applied to League if it only changed LAAP's preview.
3. Extend read-only LCU gameflow monitoring with bounded event subscriptions or safe periodic fallback if permitted. Handle ChampSelect/late lock, Quickplay/Swiftplay, reconnect, account change, and client restart without duplicate writes/actions. Start with read-only status + user-facing suggested presets. Never auto accept, ban, lock or change paid cosmetics by default; make game-changing actions unavailable absent explicit relevant authorization.
4. If an authorized independent in-client companion is possible, build a separately installable and reversible plugin with explicit IPC allowlist, origin and token validation, version negotiation and no Riot credential exposure. Test permission-denied/no-League paths. Never hijack third-party processes, intercept hidden patcher IPC, alter in-game memory, spoof paid-skin identity or bypass integrity checks.
5. Windows is primary for supported mod-related integrations; macOS must offer truthful unsupported status rather than shipping broken Windows assumptions. Add diagnostics, logs without secrets, hardware/patch compatibility checks and safe defer while in active match.

## Acceptance

- Studio/Complete theme gallery/editor/import/export and media previews work locally with real files, undo and rollback.
- Gameflow monitoring is a real read-only local client operation with consent and safe disconnect states.
- Every actual external adapter capability has real platform/license/policy test evidence or remains disabled. No game process hooks.
- Basic's existing appearance and Presence controls remain unaffected.
