# Feature Spec — Creator Studio / SkinLab-Inspired Workbench

## Target

Offer a professional, original creator workspace matching legitimate portions of Wildflover's SkinLab/LtMAO and LTK Manager Workshop, without bundling proprietary tools, copyrighted game files or implementing official skinhack bypass.

## Workspace sections

- **Projects:** New, import project, recent, export, author/license management, autosave and versions.
- **Archive Explorer:** Safe indexed tree view for `.fantome`, `.modpkg`, `.zip`, optionally WAD-type archives when legal/permitted; size, digest, compression ratio, manifest.
- **Metadata Editor:** Mod name, champion mapping, skin category, localization, author, description, thumbnail, dependencies and rights.
- **Texture Inspector:** Preview permitted DDS/TEX/PNG assets through licensed parsers or isolated converters; show dimensions, mipmaps, format, issues.
- **Model Inspector:** Read-only licensed SKN/SKL metadata validation and integrity warnings; 3D preview optional if rights/license allow. No game asset identity spoofing.
- **Property Inspector:** Strict parser for supported BIN data and safe diff view; generator/converter only for legally redistributable user content and documented formats.
- **Conflict Graph:** colliding paths, missing assets, patch compatibility, size impact and deprecated references.
- **Export Builder:** reproducible, signed/checksummed user-created packages with origin/license, deterministic file order and manifest.
- **Repair Studio:** preserve original, show exact diff/preview, only documented benign fixes for user-authored mods; do not disguise official skin assets or modify checksums to evade loader protection.
- **Review/Publish:** generate upload bundle, preview and rights attestation; creator marketplace submission via moderation if enabled.

## Tooling choices

- Prefer Rust implementation or reviewed permissive Rust libraries for archive indexing, metadata, hashing and safe file io.
- Do not bundle full CPython runtime and 203 MB hash dictionary by default.
- For specialized formats/expensive conversion, permit optional external developer tools installed by user with verified publisher/license and explicit command contract; isolate in subprocess with strict args and work directory, no shell interpolation.
- LTK Manager GPLv3 app code cannot be silently integrated into closed-source LAAP; study its docs and develop original compatible APIs.
- Avoid patent/trademark/IP claims; document author permissions and license choices.

## Creator file outputs (user-authorized only)

`*.modpkg`, `*.fantome`, `project.json`, `assets/`, `META/info.json`, `README.md`, `LICENSE`, preview media, source manifest, `checksums.sha256`. Do not create repackaged Riot WADs of official skins as commercial deliverables.

## Authoring UX quality

Undo/redo, diff previews, autosave with journal, keyboard shortcuts, command palette, recently used projects, tabs, large file paging, bilingual-safe localization, update compatibility warnings, progress/cancel/retry. Save state before expensive tool operations.

## Acceptance tests

- 200k file archive index fixture; large texture decode memory bound; path traversal and decompression bomb; diff round trip with generated test assets; crash/autosave recovery.
- Benign user-created package can import → inspect → modify metadata → export → verify byte integrity and license.
- Invalid/unlicensed content cannot reach marketplace publish; no official paid-skin assets generated or redistributed.
