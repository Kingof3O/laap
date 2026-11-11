# LAAP Final Completion Queue — v3 (2026-11-11)

This is an ADDENDUM to the *corrected* 80-file LAAP Basic / Studio / Complete v2 blueprint, not a replacement. The companion archive includes the unchanged original blueprint under `BLUEPRINT/` and eight ordered task prompts under `QUEUE/`.

## Canonical product decisions — immutable

- **Basic:** preserve the pre-existing LAAP local-only account launcher and existing icon/rank/Presence/settings/updater features. No new Studio customization and no remote account vault.
- **Studio:** standalone catalog, custom content management, themes, presets, creator tools, optional internet-enabled community and provider integrations. No Riot account vault, provisioning or account switching.
- **Complete:** Basic + Studio, including locally linked account presets; Riot session blobs stay encrypted locally.
- **Retired:** Team account sharing, online pooled Riot sessions, account assignments, leases, cloud vault administration in the new clients. Preserve archival backend and existing customer data pending separately authorized deletion/decommission.
- **Online still allowed:** client update feeds, public data catalog, verified community content, party rooms, Discord, opt-in providers and license/entitlement validation. **Never transmit Riot credential material or per-machine vault keys** to these services.

## Source precedence

1. The user's corrected decisions above / `BLUEPRINT/00-START-HERE.md` and `BLUEPRINT/02-product/EDITIONS.md`.
2. Current GitHub branch and observed working behavior (do not overwrite completed implementations).
3. `BLUEPRINT/07-contracts/feature-policy.json`, Riot's current rules and third-party licenses.
4. Detailed blueprint requirement rows and tasks.
5. This completion queue's priorities and handoff rules.

## Current audit baseline (not immutable)

At SHA `30f26a308c644314b91fe5adb56d2d25d8a83026`, source-level edition separation, a bundled Data Dragon catalog, local presets, strict ZIP/image library, theme preview, creator image-packaging, local party/marketplace service, and manual read-only gameflow checks existed. No verified in-game customization application, full WAD/Fantome creator studio, hosted service deployment, official three-edition release or paid entitlement infrastructure existed. Re-check `HEAD` before editing; if a gap was subsequently fixed, verify and mark done instead of rewriting.

## How to run

1. Extract this archive to a NEW sibling directory, preferably `C:\pw\laap\docs\LAAP_Final_Execution_Queue_v3`. This keeps the old corrected blueprint untouched. The complete original blueprint lives under `BLUEPRINT/` and the new prompts under `QUEUE/`.
2. Open the agent in `C:\pw\laap`.
3. Paste the **single launcher prompt** in `QUEUE/00-RUN-ALL.md`, and tell the agent the v3 queue root path. If context is insufficient, paste `QUEUE/01-...md` through `QUEUE/08-...md` as separate queued tasks in strict order.
4. Keep the feature matrix and ledger updated in repo `docs/implementation-tracking/` as deliverables.
5. Never convert external permission, signing-key, production-host, or manual Windows game-test blockers into fake success.

## Exact meaning of DONE

A feature is DONE only if there is actual implementation, persisted data when applicable, negative/security tests, integration tests, UI feedback states, platform-specific native test when needed, and proof of the user's stated end-to-end journey. A backend helper or mocked Playwright screen is not enough to claim full Wildflover/Rose parity.

A feature is GATED only if an external dependency has been named precisely and the app hides/disables its use with truthful messaging. A policy-excluded feature stays excluded. Track every one of the original 131 parity rows; never silently drop them.

No release, payments activation, secret exposure, production database deletion, cloud decommission or third-party binary redistribution without proper external approval/credentials and explicit final user authorization for the action.
