# TASK 08 — Single final acceptance pass and STOP

This is the last queued task. Do not generate a new refactor roadmap or ask to repeat the full audit.

## Run the acceptance campaign

1. Validate all three products on actual binaries using the corrected blueprint's `06-delivery/QUALITY_GATES.md`, `BASIC_REGRESSION_ACCEPTANCE.md`, `ONLINE_STUDIO_ACCEPTANCE.md`, feature requirements and current `docs/LAAP_THREE_EDITION_*EVIDENCE.csv`. Mark each of 131 rows with a status, current file path, test/log/commit evidence, and any exact external dependency.
2. Walk user journeys end-to-end: Basic old vault→launch→safe switch→Presence→update; Studio cold/offline catalog→preview→preset→legal package import→creator export→theme preview→room create/join→approved catalog download; Complete local account switch→account-linked preset retained without sending sessions online. Verify crash/restart/offline/permission-denied/slow machine.
3. Native OS tests: clean Windows 10/11 install; coexistence and migration; active Riot game deferral, no unsafe game process interaction; signed updater for three editions; macOS supported-feature smoke, notarization and updater. Record `NOT VERIFIED` when physical/native capabilities unavailable rather than fabricating green results.
4. Security: static analysis, dependency/SBOM/license scan, archive malformed/fuzz tests, signer verification, authentication boundaries, privacy/outbound data inspection, CSP, XSS, path traversal, concurrency/races, installer rollback. Test log redaction for session, lockfile and keychain secrets.
5. Performance: record cold/warm launch, memory idle/peak, catalog search, thousands of cosmetics, 500 mod packages, cache sizes, 7+ party clients and reconnect p95; compare against explicit declared test budgets, not unmeasured marketing adjectives. Include 125/150% Windows DPI and 960x640/1160x760/1440x900/1920x1080 UI tests, keyboard/screen reader/focus and RTL where claimed.
6. Review every user-visible control. Each click must produce actual intended behavior OR an explicit accurate gated/unsupported/needs-config state. No placeholder sales links, false 'Applied in-game' messages or release-ready claims.
7. Fix documented faults once; rerun only affected tests plus minimal regression suite. **Maximum two visual polish passes** unless a measured defect persists. Do not change architecture/product split or rewrite green components merely for aesthetics.

## Final output files and status rules

- `docs/implementation-tracking/FINAL-ACCEPTANCE.md`: exact HEAD, environment, test commands and results, source files, screenshot paths, account/vault-preservation evidence, feature completion by edition, performance, installer/upgrade proof.
- `docs/implementation-tracking/FEATURE-STATUS.csv`: all 131 ID rows with enum `VERIFIED`, `EXTERNAL_BLOCKER`, `POLICY_EXCLUDED`, `NOT_VERIFIED`; every gated row includes explicit reason and next human/vendor action.
- `docs/implementation-tracking/EXTERNAL-BLOCKERS.md`: Riot status, provider app IDs, licensed patcher/tool permission, code signing, hosting/TLS, merchant, native Windows/macOS host and deployment authorization; mark each as resolved or pending without pretending acceptance provides approval.
- `docs/implementation-tracking/RELEASE-DECISION.md`: `READY FOR REVIEW` only if all *ship-blocking* internal gates green and no required external gate missing, otherwise `INTERNALLY BUILT / EXTERNALLY GATED` or `NOT VERIFIED` with bounded list.

At the end, **STOP**. No further speculative tasks, extra audits, UI restyling or rewrite prompts. Ask the user only for the concise list of decisions/credentials/approvals that cannot be performed by code. Do not publish/deploy/charge/delete protected data without separate explicit authorization.
