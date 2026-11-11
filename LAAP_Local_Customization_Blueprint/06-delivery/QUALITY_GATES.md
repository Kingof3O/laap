# Quality Gates, Security Acceptance and Test Matrix

## General definition of done

- Feature behaves with real data and applicable native process, not only fixture screenshots.
- Code remains modular: small typed services/components; no dynamic arbitrary IPC.
- Three SKU/OS combinations compile with correct capabilities and no accidental Team cloud login.
- Every feature has loading, success, error, offline, cancellation, permission and recovery states.
- Release build includes no unapproved third-party binaries/assets.
- Accurate product documentation and no unsafe marketing claims.

## Gate matrix

| Gate | Required proof | Blocking? |
|---|---|---|
| `G01` Repository preservation | Old vault decrypted after upgrade, no session blob migration to community service, data backup restore | Yes |
| `G02` Flavor isolation | Studio cannot call vault commands; Local/Complete share correct local vault only with safe migration; no Team lease route | Yes |
| `G03` Archive safety | Fuzz/property tests for traversal, bombs, path collision, executables; malicious import rejected | Yes |
| `G04` Third-party rights | SPDX inventory, patcher binary license, reproducible sources, original assets only | Yes |
| `G05` Game integrity | no memory hooks, suspension, skinhack evasion, paid-skin unlock, default ban/pick automation | Yes |
| `G06` Cache/performance | measured startup/search/import, budgeted media, low-game mode; no stutter | Yes for release |
| `G07` Party privacy | secure room auth, opt-in, no vault data and bounded transfer; chaos tests | Yes if party ships |
| `G08` Commerce compliance | Riot product approval/acknowledgment, free tier, merchant approval, refund/legal docs | Yes if paid |
| `G09` Update supply chain | signed final payloads, correct 3 SKU feeds, native upgrade test for supported platforms | Yes |
| `G10` Accessibility/locales | keyboard, focus, contrast, reduced motion, RTL where claimed, localization fallback | Yes |
| `G11` Operations | moderator/admin, abuse report, takedown, delete/export, support diagnostics | Yes if marketplace ships |
| `G12` Real E2E | allowed game/platform adapter on authorized test environment, no false platform support | Yes for mod apply claim |

## Exact test scenarios

### Unit

- Content hash dedupe; manifest schema semver; preset priority; patch version matching; deterministic random/history; per-account preference unlink.
- Validators reject incorrect MIME, path traversal, decompression bomb, malformed images, executable/script payloads, overdeep nesting.
- Entitlements expire/grace/revoke correctly, no UI-only authorization.
- Release manifests reject wrong SKU, wrong platform, unsigned/modified artifact, unknown URL.

### Integration

- New Studio process cannot read/open local vault or invoke `save_local_account`, `get_local_account`, `launch_local_account`.
- Old Local vault migration preserves encrypted file and OS-keychain behavior; no silent key rotation.
- Cancellation mid-mod import leaves no installed partial state; rollback journal replay after simulated crash.
- Existing Riot app running during theme apply: safe defer, no arbitrary restart/termination.
- Network offline: cached catalog and local operations still work; no looping sync UI.
- Party reconnect sequence epoch, host transfer, 7 peers, stale invite, duplicate joins, server outage; no vault leaks.
- Marketplace moderation rejects stolen official skin materials, executable archives and missing rights; takedown invalidates remote cache.

### Native and packaging

- Windows clean-machine install, account switch, LTK user-installed adapter if approved, uninstall with keep-data option, signed upgrade Local/Studio/Complete individually.
- macOS smoke, app signing/notarization/updater; browser/creator features; unsupported adapter state.
- 960×640/1160×760/1440×900/1920×1080 and DPI 125/150%; keyboard focus, reduced motion, no blocked footer.
- Power-user test: 500 custom packages and 3000 catalog records; cache eviction without deleting user assets.

## Anti-infinite-edit-loop policy

- Stop reworking colors/padding after two successive screenshot correction passes unless a real blocker remains.
- Prioritize **correctness/compatibility/security** over purely subjective CSS polish once UI acceptance examples are met.
- Do not publish until required external approvals and real native upgrade tests; do not keep endlessly patching already-green unit suites in lieu of the E2E gate.
- Mark conditional features explicitly gated rather than inventing unsupported workarounds.
