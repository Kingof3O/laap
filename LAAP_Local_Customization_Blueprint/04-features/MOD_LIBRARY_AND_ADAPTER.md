# Feature Spec — Custom Mod Library, Import, Validation, Apply and Recovery

## Feature parity target

Cover legitimate custom mod workflows documented by Wildflover and Rose: `.fantome`, `.modpkg`, safe ZIP, optional user-authored WAD project containers, local asset thumbnails, tags/categories, champion/queue mapping, mod enabling/disabling, dependency conflicts, per-account preset selection and repair lifecycle. Rose now supports maps, fonts, announcers, user skins and multiple mod formats; Wildflover source reports network marketplace downloads, cache management, hot activation and custom repair tools.

## Mod package lifecycle

`Discovered → Quarantine → Inspected → RightsCheck → Validated → Indexed → Ready → Staged (optional) → Applied via Supported Adapter (optional) → Released/Uninstalled`

Possible errors: `UnsafeArchive`, `UnsupportedFormat`, `RightsMissing`, `GamePatchMismatch`, `DependencyMissing`, `Conflict`, `AdapterNotFound`, `AdapterOutdated`, `ApplyDeferred`, `CleanupFailed`. Never say applied when only cached.

## Intake pipeline

- Drag/drop and file picker; handle file association for custom mod formats only when registered/approved.
- Detect magic bytes; filename normalized; preview license and source; no arbitrary code, batch import from selected directory.
- Reject symlink/absolute/UNC/path traversal, nested ZIP bombs, huge entries, executables/scripts, Unicode normalization duplicates.
- Store SHA-256, author, declared rights, type, champion mapping, game patch compatibility and origin URL; make metadata editable but keep immutable provenance.
- Extract to staging, verify expected structure; commit content-addressed library via atomic rename.
- Optional repair engine must show before/after semantic diff and preserve original package and creator credits.

## Patcher/loader adapter

- Discover **user-installed** supported LTK or another licensed mod loader; verify publisher/source, version, executable and interface compatibility.
- Use only documented supported CLI/control surfaces. No `LeagueToolFlop.dll` replication, no ShowWindow import patching, no WebView IPC spoofing, no hidden GUI suppression, no validator identity/mesh bypass.
- Perform no game-memory hooks/suspensions, direct data tampering or admin elevation just for convenience.
- Set state `Unavailable / Supported / Compatible / NeedsUpdate / UnsupportedGameBuild / BlockedByPolicy`; all are visible to user.
- Apply is opt-in and may be disabled until approval. On unsafe match/gameflow, defer with explicit reason; never force running game to suspend or terminate.
- Carefully scope any permitted adapter to its own storage/staging; do not write directly to Riot install if adapter is unsupported.

## Conflict resolution

- Detect identical paths and exclusive asset groups, duplicate mod IDs with versions, unresolvable dependencies, patch incompatibilities.
- Preview conflict graph before applying; deterministic priority ordering and undo.
- Multiple champion mods compose only where supported by actual adapter; do not promise arbitrary mod mixing.

## Diagnostics

- Visual per-mod health: `unverified`, `safe-to-store`, `incompatible`, `adapter-ready`, `staged`, `applied`, `deferred`, `failed`.
- Mod repair report: missing references, invalid archive, inconsistent texture/file sizes, unsupported skeleton/mesh changes. Do not implement protected anti-skinhack bypass even when the tool reports it as a "fix".
- One-click export of redacted logs and dependency report; no game account credentials.

## Tests

Fuzz archive parser, path traversal, decompression bomb, duplicate/overlapping names, crafted Win executables, partial writes. Native Windows integration test must cover real user-installed adapter via permitted CLI and reversible cleanup; tests with fake stdout must not be labeled end-to-end. Platform unsupported state on macOS verified.
