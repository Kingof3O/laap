# Platform Compatibility and External Adapter Contract

| Capability | Windows x64 | macOS arm64/x86_64 | Notes |
|---|---|---|---|
| Local account launcher | existing code, must regression-test | existing code, must regression-test | Riot official client available and configured |
| Static catalog and previews | supported by app | supported by app | cached content; metadata source license |
| Local mod library and safe import | supported by app | supported by app | does not imply live game application |
| Creator inspect/export for supported source | supported by app | supported by app | converter tools may differ |
| Local LAAP UI themes | supported by app | supported by app | native LAAP only |
| League Client theme integration | conditional | conditional | Pengu docs current mac support; test exact loader build |
| LTK external adapter/game mod apply | Windows-only target, still policy-gated | unsupported by current LTK Manager | never claim mac live patcher parity |
| Party metadata relay and chat | supported when opted-in | supported when opted-in | independent from game patching |
| Mod transfer opt-in | policy-gated | policy-gated | user-created content only |
| Discord RPC | opt-in, test SDK | opt-in, test SDK | no default public presence |
| Signed updates | existing capability plus new SKU | existing capability plus new SKU | real native upgrade tests required |

## External adapter contract (only documented interfaces)

Adapter must expose (or LAAP reports unavailable): `get_version`, `get_supported_game_build`, `list_supported_formats`, `validate_candidate`, `stage_candidate`, `activate_staged`, `status`, `stop`, `restore_defaults`. This is an **ideal target**; if third-party tool does not expose such APIs, do not reverse engineer private IPC/hide windows to pretend it does. Mark unavailable and link to official external workflow.

### Adapter lifecycle

`NotInstalled → Detected → Inspected → Compatible → ConsentGranted → Available → Busy (Staging) → Applied/Failed → Stopping → Available`. Any unknown/unverified build goes `Unsupported` by default. Prompt user before client restarts; no active game suspension.

### Capability discovery

- Signature/provenance hash, executable location, name/version, OS support, reported supported game builds, interface documentation revision.
- Only launch with strict argument array (not shell) and bounded process timeout. Never send generic arbitrary `invoke` or request URL to external tool.
- No silent auto download of patcher; official manager user installation and EULA/license shown.
- On game update incompatible: disable apply, retain existing saved mods and cached previews, report reason with version.

### Optional App-Bundled Sidecar Delivery (Gate-Controlled)

If a compliant adapter CLI receives Riot/Vanguard clearance (`EXT-02`), third-party license/attribution clearance (`EXT-03`), and code-signing approval (`EXT-04`):

- Bundle only in **Studio** (`tauri.studio.conf.json`) and **Complete** (`tauri.conf.json`) Windows builds via Tauri `bundle.externalBin` (`league-mod-adapter-x86_64-pc-windows-msvc.exe` installed beside `laap-desktop-core.exe`), scoped to Windows builds so macOS targets remain intact and strictly omitted from **Basic** (`tauri.offline.conf.json`).
- Discover the bundled sidecar adjacent to `current_exe()` with a build-time pinned SHA-256 digest instead of requiring manual path browsing or hash input, while retaining explicit user opt-in consent and zero in-match mutation. See `docs/EXTERNAL_MOD_ADAPTER.md`.
