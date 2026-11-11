# Provenance, Confidence, and Evidence Register

## Evidence classes

- **A — Public first-party current**: official Riot policies; official tool README/docs; current GitHub repo code; author website claims about marketed features.
- **B — User-supplied reverse-engineering dossier**: nine Markdown files in `reference/wildflover-analysis/`, allegedly derived from Wildflover v4.0.7 binary, not independently reconstructed by this plan author. Treat as detailed working hypotheses.
- **C — Engineering proposal**: all new LAAP modules, performance targets, pricing tiers, API payloads and product identifiers are recommendations, **not existing features**.

## Grounded source URLs (consult current revisions)

| ID | Source | Relevance |
|---|---|---|
| S01 | https://github.com/Kingof3O/laap | Actual existing architecture, MIT license, current source versions |
| S02 | https://github.com/Alban1911/Rose | Live Rose feature set, legal warning, MIT source, packaging |
| S03 | https://github.com/Alban1911/Rose/releases | Recent details: 22 languages, Quickplay/Swiftplay, party resiliency, owned skins logic, plugin lifecycle |
| S04 | https://wildflover.wf/en/ | Wildflover marketed 2,100+ skins, skins/chromas, client skins, themes, party, TFT, auto-ready/pick, shop; self-reported counts |
| S05 | https://github.com/LeagueToolkit/ltk-manager | Supported tools/platforms and GPLv3 manager code |
| S06 | https://github.com/LeagueToolkit/ltk-manager/blob/main/LTK-PATCHER-LICENSE.md | Patcher binaries have separate license and signing terms |
| S07 | https://github.com/PenguLoader/PenguLoader | Client customization/in-client plugins |
| S08 | https://github.com/PenguLoader/docs | Platform specifics and safety caveats |
| S09 | https://developer.riotgames.com/docs/lol | API policies, registration, monetization, LCU documentation, Data Dragon |
| S10 | https://developer.riotgames.com/policies/general | Product approval and allowed monetization, free-tier requirement |
| S11 | https://support.riotgames.com/en-us/riot/performance/game-memory-access-removed-for-third-party-apps | 2026 game-memory access restrictions |
| S12 | https://support.riotgames.com/en-us/riot/events/third-party-applications | Skin-hack and third-party policy risks (localized variants if necessary) |
| S13 | https://www.riotgames.com/en/terms-of-service | Rights, account sharing restrictions, Riot IP |
| S14 | https://v2.tauri.app/plugin/updater/ | Signed native updater and platform artifacts |
| S15 | https://docs.lemonsqueezy.com/help/getting-started/supported-countries | Egyptian bank payout country listing; onboarding remains case-by-case |
| S16 | https://www.paddle.com/help/start/account-verification/which-countries-are-supported-by-paddle | Merchant-of-record seller country policy; payment approval remains case-by-case |
| S17 | https://github.com/discord/discord-api-docs | Discord RPC presence and social features |

## Dossier findings to verify before shipping

1. Wildflover v4.0.7 reverse-engineered vs public website advertising v4.0.5: don't present binary details as proven current production design.
2. User dossier says Rose uses only preprocessed remote packages, but Rose's repo now includes stronger mod formats, party, gameflow, history, reconnect; re-evaluate the actual current release rather than the older summary.
3. User dossier says Rose's integration is "low risk" — **not** an anti-cheat guarantee; its README warns about official skin unlock risk.
4. User dossier's assertion that local extraction is DMCA-immune is **not correct** as legal certainty; redistribution rights remain independent of local source.
5. User dossier lists LTK DLL window hooks, WebView hijacking and validator bypass; document only as **excluded proprietary behavior**, never transplant or recreate the bypass in a commercial SKU.
6. Do not conflate custom fan-created assets with unauthorized unlocking of paid Riot skins.

## Source interpretation

`reference/wildflover-analysis/07-tauri-ipc-commands-reference.md` is the command inventory source for `FEATURE_PARITY_MATRIX.csv`. The existence of an IPC name indicates a purported callable entrypoint, **not confirmed success, stability, license clearance, or entitlement**. Design LAAP's own typed, minimal services rather than copying names and semantics blindly.
