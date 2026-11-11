# End-to-End User Journeys and Recovery Paths

## First launch — Local edition
1. Detect platform and installed League Client without changing game files.
2. Ask whether to keep existing LAAP local accounts; never auto-delete or re-encrypt session material into customization store.
3. Explain network opt-ins separately: metadata catalog, updates, themes, community party, diagnostics.
4. Offer read-only collection browse using cached Data Dragon/static metadata; offline empty state includes Import from local source.
5. Invite optional mod manager/loader setup; show publisher/license/current version/status, do not invisibly install/hijack.
6. Introduce account-bound presets as a removable preference, not required for switching.
7. Render one coherent Velvet Amethyst workspace and a compact system health indicator.

## First launch — Studio only
1. Does not request Riot account login/session capture or show local vault navigation.
2. Detect local game install only if user wants a supported optional integration.
3. Setup a source folder, approved importer and local library.
4. Browse, preview, verify and create a community mod.
5. Require consent for external loader, online marketplace, party or Discord.
6. Work offline with local media; present unsupported platform state truthfully.

## Complete account customization
1. Select existing local profile; set a persistent per-account default `PresetRef` in customization store.
2. Select champion and user-created custom look; show preview + compatibility + license/right-to-use + applied/not-applied status.
3. Launch local Riot account through existing safe operation lock. Apply only through reviewed, enabled adapter if supported and user explicitly requested.
4. On client restart/patch, detect configuration drift and offer revalidate; never silently run a risky patch.
5. On Riot game session detected, throttle heavy UI and background tasks; no process-suspend behavior.
6. On exit, clean temporary staging and preserve the underlying account session/vault.

## Import and repair a custom mod
1. File chooser for `.fantome`, `.modpkg`, safe `.zip` and optionally a user-authored project directory.
2. Quarantine input; inspect metadata, extension, archive traversal, decompressed-size limits and hashes; don't execute scripts.
3. Show recognized champion, asset types, declared license, author, game compatibility and conflicts.
4. If a repair is possible, preview diff, save a new version, retain original and roll back on error; never rewrite live Riot files in place.
5. Installation/applied status uses documented adapter API only; errors link to diagnostics.
6. Export to package only with permission and original/authorized assets.

## Client theme configuration
1. Select 1 of built-in accessible theme templates or import user-owned media.
2. Choose background by client surface, font, transition and optional lobby audio.
3. Validate size, frame-rate, aspect ratio and rights; video/background resource budget.
4. Preview in LAAP, confirm apply, backup old theme config; staged activation via supported loader only.
5. Roll back to defaults on client upgrade/loader conflict; never write arbitrary JS supplied by network creators without sandbox/review.

## Party of friends
1. Enable online party deliberately; create or join a short-lived invite room.
2. Display who can see the room and what data is sent; no Riot session tokens or account secrets.
3. Peers exchange public, consented skin/mod identifiers and cryptographic content hashes.
4. Missing permitted custom mod => show source rights/size and require explicit receive approval; default metadata-only.
5. Queue transitions, lost network and duplicate join preserve state with sequence numbers/reconnect backoff.
6. On exit, expire invite, delete temporary transfers and wipe room chat per configured retention.

## Failure/edge journeys

- Offline/no catalog: cached last-good data, clear version/age, local import remains usable.
- No League installed: browse/creator functions enabled; apply/LCU unavailable with guided detection.
- Patcher unsupported or patched: no apply, no auto-retry loop; tell user to update supported external manager.
- Active game during theme switch: queue/defer and ask; no client restart without explicit informed consent.
- Interrupted download: hashed partial file quarantined, resume only if server supports range with matching immutable content hash.
- Mod corrupted after app crash: original preserved, transaction journal replay/rollback, no vault loss.
- Two editions on same computer: separate app IDs, keys, library roots, deterministic shared public cache only if safe.
- Team-to-Complete migration: release lease, export user-owned metadata; do not pull other members' session secrets into Local vault.
- Payment/license service down: keep free and already locally licensed features for reasonable offline period; no account hostage.
