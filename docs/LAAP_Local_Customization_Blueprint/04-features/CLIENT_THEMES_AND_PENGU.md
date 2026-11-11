**Edition scope v2.0:** This entire NEW feature family is for **LAAP Studio and LAAP Complete only**; it is NOT part of **LAAP Basic**. Basic remains the current local-account launcher. Where this document refers to an existing local account/preset binding, that extension applies **only in Complete**, not Studio. Online Studio services may remain available with appropriate consent, without remote Riot-account storage.

# Feature Spec — Client Themes, Media, Typography, Music and Optional In-Client UI

## Intended feature parity

Wildflover dossier lists `client_themes_pick_media`, `save_asset`, `clear_asset`, `set_music_options`, `pick_font`, `set_font_preset`, `clear_font`, `set_transition`. Its public site advertises 16 customizable League Client surfaces, pictures/GIF/video, custom fonts/music, and preset themes. Rose prioritizes in-client champion select selectors and settings. LAAP should combine the best UX **without** creating a hidden hijack system.

## Theme editor

- Gallery with curated original/local themes; theme preview in LAAP using representative UI skeleton, *not* a counterfeit Riot screenshot.
- Up to configurable surfaces based on actual supported loader; do not hardcode exactly 16 as a guaranteed capability.
- For each permitted surface: color, optional image/GIF/video, cover/contain/position, tint/opacity, contrast, blur, fallback.
- Font family/preset: locally licensed assets, caps on size/weights; readable substitutions and RTL support.
- Audio: user-owned tracks only; mute/volume/loop, stop on focus/lobby exit, per-surface explicit grant; avoid redistributing copyrighted music.
- Transition choices (none/subtle/medium) and OS reduced-motion respect.
- Per-account profiles only in Local/Complete, global themes Studio.
- Export/import original creator theme packs with rights manifest and one-click reset.

## Runtime integration

- Optional user-installed Pengu Loader (or a maintained, documented, licensed alternative); follow documented activation/deactivation behavior.
- Implement plugin with a constrained message contract and no raw `__TAURI_INTERNALS__` access; local IPC token ephemeral and bound to 127.0.0.1 and service purpose.
- No arbitrary remote JS/CSS executed with full client privileges. If custom CSS is supported, scope/filter it, warn user and keep it local and user-authored.
- Activating a theme must be explicit; if Riot Client is running show defer/confirmation. Never restart in Champ Select/game automatically.
- Provide rollback, orphan cleanup, incompatibility fallback, and user-controlled disable/remove of the loader.

## In-client companion feature set (conditional)

- Champion pick overview, supported skin/chroma metadata picker, mod availability badge, last choice/history/random preference, party members, notifications, settings, localization.
- Must never claim to unlock unowned official skins. Use it as a **selection companion** for approved user-created content, not an official cosmetic replacement.
- Separate plugin lifecycle: install, version check, handshake, rebind if client restarts, safe unload, timeout/cleanup and no client freeze. Default disabled until safety/policy gates satisfied.
- Rich content preloaded before champ select to minimize stall; no process suspension.

## User-visible success criteria

- Theme creation/import works completely offline.
- All staged changes can be reverted without leaving a loader active or broken client UI.
- Video and audio respect performance mode and controls; no automatic loud playback.
- Page shows source license/provenance for media and fonts.
- In-client plugin displays only when installed, compatible and user-enabled.

## Tests

Dark/light/low-contrast previews, large fonts, media decoding failure, corrupted GIF/video, missing user file, high-DPI, slow PC, theme removed during client uptime, loader unavailable, macOS compatibility. Verify no user media or session data is uploaded without explicit opt-in.
