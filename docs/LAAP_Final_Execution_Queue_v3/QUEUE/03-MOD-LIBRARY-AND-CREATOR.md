# TASK 03 — Finish mod library and creator workflows, without unsafe activation tricks

## Current state

`customization/library.rs` validates rights-declared bounded ZIPs containing supported images, content hashes and a detached manifest; the Creator Workshop exports image ZIPs. This is NOT equivalent to installing `.fantome`, `.modpkg`, WAD and in-game custom mods.

## Do now

1. Implement safe **original/authorized** `.fantome`, `.modpkg` and ZIP inspection and import where each archive format can be legally and reliably parsed; never accept extensions as proof of format. Use versioned adapters with clear unsupported-format diagnostics. Validate paths, entry types, hashes, symlinks, file names, byte quotas, decompress ratios, image dimensions and signature/manifest metadata. No arbitrary code execution, game memory access or executable payloads.
2. Add validated mod metadata, tags, search, dependencies and conflicts, content-addressed deduplication, compatibility checks against known game versions, transactional staging, a backup/restore plan, rollback, uninstall cleanup and crash recovery. Keep user-created content local; external catalog download is a separate phase.
3. Make Creator a real workspace for allowed file types: multi-project save/load, drag/drop, image and texture metadata inspection/conversion when rights and tooling permit, bulk changes, undo/redo, diff, export/import round-trip, signed or checksummed manifest, clear licensing attribution and safe package repair of user's own originals. For WAD/BIN/SKN/SKL, first document what formats can be parsed read-only under the available licenses, then implement only authorized, independently verified operations; never create anti-skinhack normalization or paid-skin extraction bypasses.
4. Keep a **separate external game adapter interface** behind capability+policy gates. Don't silently invoke third-party patchers, hook LTK, suspend League processes, bypass validators or describe unverified mod application as working. An allowed adapter must have explicit user consent, license compliance and real clean-machine compatibility checks.
5. Implement progress/cancel/recovery, batch operations, archive fuzz tests, low-memory operation, stable IDs and persisted diagnostics. Fix misleading `.fantome`/`.modpkg` file picker behavior if the backend does not truly support the format.

## Acceptance

- Import/edit/validate/export/reimport/restore of approved user-authored assets works with native filesystem and corrupted input rejection.
- Conflict/compatibility reports use actual package content; no fake `installed in League` messages.
- Archive rejection covers traversal, bomb, Unicode collisions, repeated entries, symlinks, executable tricks, corrupted media and unsafe paths.
- All unapproved external integrations show a truthful disabled state; all 131 relevant parity rows have status and evidence.
