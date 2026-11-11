**Edition-specific release rule:** Basic is the existing LAAP Offline feature set with Team removed; it MUST NOT acquire new Studio modules. New customization, creator, marketplace, themes and party backends ship only in Studio and Complete. All online features remain available in those two products, with consent and proper degraded/offline states.

# Cross-cutting Release, Security, Platform and Performance Plan

## Release train

1. `basic` existing `com.laap.offline` + migration-safe signed feed `latest-offline.json`.
2. `complete` existing Team identity `com.laaP.desktop` during transition; old `latest-team.json` remains reachable for migration. Never cross-install.
3. `studio` new `com.laap.studio` and distinct signed `latest-studio.json`.
4. CI should validate each installed app ID, display name, artifact identity, Tauri public key and release manifest with real final bytes.
5. Windows SignPath/authenticode and Tauri Minisign signing occur in supported final-payload order. Keep pinned keys, no test keys in releases.
6. macOS Developer ID/notarization if distributing; new Studio identity separately signed. No unsupported Linux promise.
7. Version numbers/supported feeds have a documented minimum supported upgrade version and transition compatibility.
8. Build source/SBOM/license notices; no Wildflover proprietary binary or game asset included.

## Code signing + supply chain

- Pin high-risk GitHub actions by SHA or approved version; use OIDC/minimum permissions.
- Scan dependency licenses, npm/cargo advisories, Gitleaks, archives/third-party binaries.
- Generate reproducible hashes and signed attestations for each installer and optional external adapter.
- Release gates fail if even one SKU lacks expected mandatory platform assets or signatures; no partial manifests claiming success.
- Installer uninstaller must not remove user local profiles or creator assets unless explicitly selected in an optional cleanup wizard.

## Security threat scenarios

| Threat | Control | Evidence |
|---|---|---|
| Studio webview attempts to read vault | compiled capabilities absent + filesystem sandbox, negative IPC test | code + integration |
| Malicious mod ZIP traversal / symlink / bomb | quarantine, canonical path, size/depth caps, no arbitrary scripts | fuzz tests |
| Arbitrary downloaded executable from marketplace | only safe data containers; executable reject | tests |
| Party sends exploit content | strict schemas, rate limits, no remote code execution, rights consent | protocol fuzz |
| Catalog delivers copyrighted paid skins | rights verification + moderation + takedown | content policy review |
| Overlay running during match | safe read-only observations; deferred apply; no game process suspension | native lifecycle |
| Third-party tool hijack or permission creep | documented CLI adapter + consent + health/rollback | adapter contract tests |
| License server down | offline grace and free functions unaffected | chaos test |
| Cross-SKU updater | three pinned feeds, per-manifest edition checks and binary metadata | signed E2E |
| League patch changes format | patch-version compatibility manifest + fail closed; health doctor | fixtures and canary |
| Compromised cloud admin | isolate catalog/party/entitlements from vault; scoped RBAC | penetration test |
| Client theme remote script injection | no untrusted JavaScript, scoped CSS/media validation | CSP + security test |

## Performance engineering

- Use on-disk SQLite FTS5 or audited equivalent to index champion/mod search; keep 90% of catalog thumbnails out of initial startup bundle.
- Lazy-fetch media on browse; prefetch visible region only, cancel stale requests.
- Content address mods by SHA256; dedupe across presets; avoid duplicating 200 MB dictionaries.
- Incremental compatibility index keyed `gameBuild + modHash + parserVersion` instead of rebuilding every launch.
- Prefer Rust image and archive parsing; worker queues with resource caps; isolate IO-bound from CPU-bound tasks.
- Auto-adjust to Low Performance Mode during active match: no videos/high-frequency fades, defer background mod scans/cloud sync, maintain safe application responsiveness.
- Micro-benchmark archive import, theme preview, cache hit ratio, preset resolution, party reconnect and memory. Report p50/p95/p99 by OS/machine.
- Never promise WebView2 launch speed or memory results without actual measurements.

## QA gates

G1: compile/isolation. G2: feature-specific tests. G3: real Windows installed app + League test on clean authorized machine. G4: Mac no-false-claims browse/creator test. G5: signed upgrade from old Offline and Team. G6: user data preserved. G7: Riot/legal approval for commercial features. G8: merchant and content rights ready. Details in `06-delivery/QUALITY_GATES.md`.
