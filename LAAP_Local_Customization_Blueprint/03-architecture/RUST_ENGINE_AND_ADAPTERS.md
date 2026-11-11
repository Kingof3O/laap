# Rust Services, External Tools and Gameflow Bridge

## Rust-native services

- `catalog::CatalogService`: online Data Dragon/catalog fetch and version pinning; cache fallback; mappings of champion, chroma, skin metadata; no ability to unlock official paid cosmetics.
- `cache::ContentStore`: SHA-256 immutable cache, LRU/age-based GC, disk budgets and nonblocking indexed metadata.
- `importer::ImportService`: user-selected archive intake, format probes, rights metadata, quarantine, extraction limits, conflict scan, file-type validation.
- `mods::LibraryService`: enable/disable, metadata, compatibility, preview references, version history, undo, explicit apply requests through external adapter only.
- `presets::PresetResolver`: deterministic order: account+champion+queue override > account default > champion default > global default; deterministic fallback and conflicts.
- `themes::ThemeManager`: user-provided media, scoped client surfaces, fonts/music transitions; backups/restore and staged apply.
- `gameflow::ClientObserver`: opt-in phase observation through documented/supported read-only LCU endpoints; bound connection to loopback, no arbitrary URI/HTTP relay from JS.
- `adapter::AdapterManager`: detect supported version and capabilities via official interfaces; disallow unknown CLI command strings and shell interpolation; provenance verification.
- `tasks::TaskManager`: bounded work queues, cancellation token, progress snapshots, task coalescing, operation locks.
- `diagnostics::Doctor`: redacted logs, current capabilities, versions and readiness, cleanup.

## Third-party integration policy

**LTK Manager:** GPL-3.0-or-later application; patcher binary has its own license. We may support a **user-installed tool through a documented supported CLI** after verifying current interface and license. Do not copy GPL code into proprietary LAAP or bundle without legal review. Patcher binaries redistributed only after compliance with signature/attribution/license conditions, and an explicit platform policy/anti-cheat review. Never inject a DLL to hide LTK windows or hijack its Tauri IPC. If official CLI does not support a desired operation, show unsupported state rather than hack it.

**Pengu Loader:** optional in-client cosmetic plugin only; validate supported versions, OS, license and project policy. Use a separate locally installed plugin with strict webview messages, and a named allowlist of features. Never expose an arbitrary Tauri invoke bridge or local auth token to it. Loader deactivation must restore the original client state. No automatic client restart during live matches.

**Rose source:** MIT repo can inform modularity/UX, but copy only appropriately attributed compatible code after source/license review. Rose's real official-skin unlocking behavior does not establish legitimacy and must not be cloned into a commercial product without explicit authorization.

**Wildflover reverse engineering:** use as functional inventory only. No distribution of extracted proprietary DLL, 203 MB hash database, packaged game assets, or recovered author secrets; no anti-skinhack normalizer.

## Optional LCU observer

Use gameflow phase transitions (`None`, `Lobby`, `Matchmaking`, `ReadyCheck`, `ChampSelect`, `InProgress`, `EndOfGame`) for **read-only display, preset suggestion and lifecycle safety**. Subscription is disabled until user opts into client integration; use TLS localhost identity validation, no remote requests, restrict endpoint paths to a reviewed allowlist and redact lockfile credentials. Avoid undocumented write endpoints in default app. Auto-accept/ban/pick/lock remain policy-gated capabilities and MUST NOT be implemented implicitly in a 'gameflow' service.

## LCU resource strategies

- Connect on demand; incremental observer with bounded retry exponential backoff, jitter and max reconnect attempts.
- Store only needed phase/champion identifiers, with <=1s coalesced UI notifications where possible. Actual rate adjusted by instrumentation; no per-frame polling.
- Handle unsupported Riot patch, missing client, swapped account, network certificate, invalid JSON, lost socket, concurrent account switch.
- Do not rely on `PUUID` identity alone to run mod changes while a local account session is being replaced; enforce owner operations.

## Updater and shutdown

- Existing signed Tauri updater must remain independent from mods; never switch production pinned keys as a byproduct of adding Studio.
- Before updating, defer if game/provisioning/adapter apply/theme operation/marketplace transaction is in unsafe transition.
- Recovery journal should handle killed app mid-import or theme apply without leaving corrupt presets/partial content.
- Every adapter operation may be canceled where safe; after installer phase starts, show accurate non-cancellable state.

## Runtime performance goals (initial targets, require measurement)

| Work | Target | Verification |
|---|---|---|
| Cold start without network | p95 < 1.8s after OS process launch on typical SSD system | 30 cold-start measurements by machine class |
| Roster render | p95 < 100ms for 100 stored profiles | browser trace and memory budget |
| Catalog search | p95 < 75ms after index warm | 5000 items stress fixture |
| Cached preset resolve | p95 < 20ms pure resolver, no disk | benchmark |
| UI task progress | 95% updates smoothly without layout shift | screenshot/video + Layout Shift trace |
| Cache growth | explicit budget by asset family, transparent cleanup | disk usage test |
| Background game mode CPU | idle < 0.5% CPU avg after warm; sample on real Windows machine | 10-min Windows performance trace |
| Heavy work while in game | pause/low-priority, memory budget based on measurements | task scheduler integration test |

Targets are hypotheses, not claims about performance already achieved.
