# Executable Agent Rules — Definitive Basic/Studio/Complete Scope

## Product contract (NOT OPEN FOR REINTERPRETATION)
- `basic`: existing LAAP Offline/local accounts only, with every already-working feature preserved and shared Team/cloud account mode retired. No new Studio modules, catalogs, custom-mod manager, extra themes, creator, party, marketplace, Discord or Studio entitlements in Basic.
- `studio`: Wildflover/Rose-inspired full supported customization suite with optional online features, but **must not compile/register Riot local-account vault or session-switching IPC**.
- `complete`: **all Basic + all Studio** supported features, plus optional local-account-preset linking (Riot sessions always local). No old Team vault.
- New online services may operate in Studio/Complete: marketplace, hosted approved mod library, party WebSocket relay, optional content transfer, Discord, stats integrations, AI/TTS, licensing and signed updates. NO Riot account sharing, cloud session blobs, team leases, admin account assignment or remote Riot account sign-in.
- Existing updates and optional Data Dragon/icon/rank requests in Basic remain; don't confuse the word `local` with blocking all internet.

## Engineering, safety and commercial rules
- Work against the real latest `Kingof3O/laap` main. Preserve old `com.laap.offline` and `com.laaP.desktop` installation/update identities; Studio gets new `com.laap.studio` identity. Do not rotate trusted signing keys without migration.
- Preserve existing `laap_local_accounts.json`, OS-keychain AES-GCM keys, account identifiers, session material and migration/rollback. No silent Team session import or production cloud deletion.
- Use one thin modular Rust/Tauri 2/React 19 codebase, explicit compile gates and typed IPC. All three builds must prove correct capabilities and distinct artifacts. No dead buttons, demos, hardcoded production data, god files or fake results.
- Basic must pass before/after behavioral regression tests for add/edit/import/launch/switch/recover/delete/favorites/notes/rank/icon/presence/tray/settings/update and all relevant safeguards.
- Studio+Complete must include eligible Wildflover/Rose feature families from the full 131-row parity CSV, with clean improved UX, owned assets, fast cache/index, reversible operations and complete error handling. Restricted capabilities remain documented but not secretly enabled.
- Modded/altered League Client integrations are optional, explicit user consent, separate review, version compatibility, safe rollback and correct platform gating. No unowned official paid skins, protection bypasses, Win32/third-party DLL hijack, privileged game memory hooking, or process suspension.
- Third-party dependencies: verify actual licenses and redistribution rights. Do not redistribute Wildflover private assets/binaries, Riot paid skin assets, or specially licensed LTK patcher files.
- No external online service receives encrypted or plaintext Riot tokens, saved Riot login sessions, local vault files or private LCU credentials. Party IDs are pseudonymous and bounded; access to marketplace/catalog is independently scoped.
- Network features remain capable and functional in Studio/Complete, consented as needed, and degrade gracefully offline. Basic requires no new cloud account or paid activation.
- No subagents by default. No unapproved production release, tag, sale, deployment, cloud shutdown or destructive migration. Keep proof/checkpoints; do not claim native E2E from simulated PE files.
- Avoid endless UI churn: fix concrete usability/accessibility issues, then freeze styles after acceptance; execute actual features.

## Execution
1. Read `00-START-HERE.md`, `02-product/EDITIONS.md`, `02-product/BASIC_STUDIO_COMPLETE_FEATURES.csv` and `06-delivery/MASTER_AGENT_PROMPT.md`.
2. Recheck repo and originals; record exact installed modes, existing Basic behavior and current CI. Apply migration plan non-destructively.
3. Implement P0-P9 in gated vertical slices, keeping Basic identical apart from Team retirement and necessary compatibility.
4. Track each parity row by product, support gate, owner, source/test and actual proof; do not treat gated features as implemented.
5. Verify 3 real builds, 3 signed updater feeds, installed-version upgrades, Basic regression, vault isolation, Studio cloud services, code signing, archive security, platform compatibility, policy/licensing approvals.
6. Report what shipped, not just plans/tests; stop instead of lying about features or legal approval.
