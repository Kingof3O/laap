# TASK 02 — Complete the real catalog, selections and local presets

## Current state

Versioned Data Dragon, bounded first-launch pack (reported 173 champions, 9,268 cosmetic records, 2,136 previews), local cache, random champion, favorites/history, portable preset import/export and Complete-only opaque local account binding already exist. They are the BASELINE, not work to recreate.

## Do now

1. Expand skin/chroma/form metadata and selection preferences using a documented, rights-cleared, versioned public data source. Implement accurate per-champion favorites, last-used/historic skin, random skin from allowed choices, form/chroma availability, queue preference resolution (Classic/Quickplay/Swiftplay/ARAM/Arena/TFT where applicable), region/patch mismatch handling. Distinguish available metadata from unverified owned cosmetic status; never infer ownership.
2. Build robust catalog search, sorting/filtering, accessible keyboard selection, large-data virtualization, working preview fallback and cache eviction. Patch update must preserve offline fallback and saved preferences. Avoid shipping unneeded 100+ MiB into Basic; measure Studio/Complete installer growth.
3. Preserve/extend versioned preset schema, transactional import preview/commit, export with native save dialog, conflict/revision handling, duplicate/delete, undo where appropriate, safe orphan handling when a linked local profile is deleted, and opt-in account-bound *preference selection* in Complete. Do not claim in-game skin application.
4. Support localized UI with English fallback, test Arabic RTL, and create a documented translation workflow for the 22 League UI languages without claiming untranslated locales are complete. Verify supplied catalog locale set matches actual data availability.
5. Add real native Rust store and file IO tests, malformed-catalog fixtures, patch drift, random/history/priority behavior and product E2E on the packaged native UI. Verify source attribution.

## Acceptance

- Cold offline first launch can browse real bundled champion data; warm repeat loads measurably faster or at least within recorded budgets.
- Every supported cosmetic selection has defined ID, preview availability/absence and persisted preferences; no display-only fake equip action.
- Complete account binding survives restart; Studio cannot query or list local accounts; Basic has no Studio catalog.
- Real data tested natively; screenshots with mocked IPC only count as UI tests.
