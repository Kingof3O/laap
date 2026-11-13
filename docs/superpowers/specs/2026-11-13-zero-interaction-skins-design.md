# Zero-Interaction Skins (Custom + Unowned Official) — Design

**Date:** 2026-11-13  
**Status:** Approved to implement (user: “yeah go on do it”, prefers best UX over app size/download tradeoff)  
**Risk:** User explicitly accepted policy/ToS/risk (“on my own risk”).

## Goal
First-run (and ongoing) use requires no user setup or file imports: LAAP makes **all official skins (including unowned)** and **custom mods** usable locally, with a skin picker in **Champ Select inside the League client**. Skins are applied automatically via a managed patcher backend; only the local player sees them.

## Decisions (my calls, stated)
- **Patcher backend:** auto-provision a managed mod-tools/cslol-tools backend on first use (download ~small, with in-app progress) rather than bloating the installer. Cache locally for offline reuse. Auto-configure as the adapter; no manual path/SHA/consent clicks.
- **Skin catalog/content:** enumerate the full official skin catalog from DDragon/embedded catalog data (no user-supplied files). For in-game rendering of unowned/custom skins, prepare/apply mod overlays via the managed backend using assets available from the local League install and/or managed mod packages on demand.
- **Picker UX (professional):** in-client Champ Select picker via the Pengu companion plugin (already scaffolded) showing all skins for the locked champion; selecting triggers apply. LAAP window also exposes the same controls. We also *attempt* to set the Champ Select selection via LCU for native-picker feel (best-effort, patch-dependent) but never rely on it alone for rendering.
- **Zero interaction:** on first launch/first use, auto-detect League, auto-enable/consent adapter+runner+auto-apply, auto-start observer/bridge/companion install flow as needed, with a single unobtrusive progress/status indicator for one-time downloads/prep.
- **Safety/behavior:** no Vanguard bypass/memory injection implemented by LAAP; all patching delegated to managed mod-tools overlay backend. Defer activation during live match; auto-restore at safe phases.

## Architecture
1. **Bootstrap (`skin_bootstrap` module):** idempotent first-run setup — detect League, provision managed backend (download/verify/extract), write adapter config (consent/clearance/autoApply true, managed path), ensure bridge/runner running, ensure companion plugin installed when Pengu/plugins dir resolvable. Emits progress state for UI.
2. **Managed backend adapter:** `ManagedAdapter` that satisfies LAAP’s adapter contract by driving mod-tools (provisioned binary). Discovery prefers managed path; external user path remains override. Auto-download from configured release source, verify, store under app data `adapters/mod-tools/`.
3. **Skin catalog service:** `catalog_all_skins(champion_id)` returns all skins/chromas from DDragon snapshot/cache. Exposed via Tauri command and bridge state for Pengu/UI.
4. **Official-skin mod resolver:** given `(champion_id, skin_id)`, resolve or generate an applicable mod package/overlay targeting that skin (from local game assets when possible). Cache generated artifacts.
5. **Apply flow:** on selection (in-client or LAAP) → best-effort LCU `PATCH /lol-champ-select/v1/session/my-selection {selectedSkinId}` → resolve mod for skin → stage/activate via managed adapter → record journal; auto-restore on Lobby/EndOfGame.
6. **Pengu companion v2:** drawer lists all skins for detected champion (scrollable), indicates selected/active, sends `select_skin { championId, skinId }` / `select_custom_mod`.
7. **UI:** Client/Champ Select view shows full skin grid for detected champion + status; first-run shows a non-blocking “Setting up skins…” progress when provisioning.

## Out of scope / limitations (honest)
- Perfect emulation of Riot’s native carousel ownership for every patch without patching is not guaranteed; rendering relies on the managed overlay backend.
- Generating overlays for every official skin from local WADs is complex; implementation proceeds incrementally (champion’s available skins, on-demand), with graceful fallback + diagnostics if a specific skin cannot be prepared.
- No kernel injection/Vanguard bypass in LAAP code.

## Verification
- `cargo check`, targeted unit tests (bootstrap config, catalog listing, LCU selection helper, resolver), `tsc -b`, manual run: open app → no setup prompts → champ select shows all skins → select → applied locally.
