# Instructions for AI Coding Agent — LAAP Local + Studio + Complete

## Mission
Implement the enclosed blueprint against the **real latest** `Kingof3O/laap` repository. This is a substantial product transformation. Follow the provided phase gates and execute the **current phase** end-to-end, rather than pretending a 150-file migration is verified after a single frontend build. Do not repeatedly ask the user for already chosen product decisions. No subagents by default.

## Hard rules
- Retire **cloud shared-account/Team mode**; keep locally encrypted personal accounts; preserve existing keys, data, user preferences, app updater trust and signed identity.
- Build **Local**, **Studio**, **Complete** from shared services with compile-time feature guards and run-time entitlement/consent checks. Do not split into separate duplicated repos.
- LAAP's existing Team API is **legacy migration infrastructure only**, NOT the party/marketplace service. Never pass Riot session blobs to new cloud services.
- No official Riot paid-skin unlock, skinhack validator evasion, asset identity spoofing, DLL/Win32 hook hijacking, unsigned driver, game-memory access, process suspensions, auth interception or automated gameplay exploit.
- Preserve high-level feature parity *in the backlog*, including restricted features marked as not shippable pending policy review. Never quietly build restricted features.
- The existence of an open-source repo is not permission to bundle its patcher binaries or copy GPL code into a proprietary module. Verify SPDX and per-binary licenses.
- No hardcoded secrets, mock data in production, false progress, unverified compatibility claims, dead buttons, or huge god files/classes.
- User-owned and legally redistributable community mod packages only; never bundle or redistribute protected paid Riot content.
- Always obtain explicit consent before modifying a League Client installation or activating a third-party loader. Support health checks, undo, backups and clean removal.
- No privileged/elevated execution unless genuinely necessary and explained. No raw arbitrary shell command IPC from webview.
- Any network-enabled feature is strictly opt-in and survives internet loss gracefully; account switching and local mod/library management should not require activation-server reachability.
- No release/tag/deployment/publication, destructive cloud teardown or irreversible migration without explicit authorization.
- Do not promise 100% anti-cheat safety; Riot approval and commercial compliance are separate gates.

## Execution discipline
1. Recheck repo SHA, main branch, installed tool versions, Riot/Pengu/LTK API versions and sources; capture evidence.
2. Build a feature-by-feature traceability matrix from `FEATURE_PARITY_MATRIX.csv`; label `built / gated / not started / intentionally excluded` with evidence and tests.
3. Work in small coherent commits; do not silently delete legacy Team data. Keep migration reversible until sunset approved.
4. Add migrations, unit/integration tests, failure modes, screenshot fixtures and documentation alongside each feature. No tests-only mock pretending to exercise real native tools.
5. Implement fully completed phase work; run frontend and Rust checks, UI tests, platform-specific tests, license scans, dependency audits.
6. Record what works, what could not be verified (especially real LoL client and patcher), and whether release policies/rights are satisfied.
7. When unclear, choose the safe, reversible and minimal surface and record the assumption in `DECISIONS_LOG.md`; request user intervention only for external approval/credentials/irreversible business decisions.

## Build promise
Three SKUs / flavors may share code, but must have **separate install identities and updater feeds**, accurate feature flags, no Team routes in production, and guaranteed preservation of existing local vaults. A full end-to-end native installer upgrade test is not replaced by a file-signature fixture.
