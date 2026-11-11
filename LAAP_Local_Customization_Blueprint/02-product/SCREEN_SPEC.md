# Product Screen Inventory — UI/UX Contract

**Visual direction:** LAAP Velvet Amethyst: deep violet canvas `#100D19`, smoked-purple panels `#241D34`, lavender accent `#C9A6FF`, pearl text `#F8F2FF`; use actual design tokens from `apps/desktop/src/styles/tokens.css` and improve atmospheric lighting without overusing glow or pill badges. Reuse Sora/Manrope local fonts. Retain native Tauri window controls and user settings. Dynamic empty/loading/error/offline states mandatory.

| Route / Screen | UI regions / contents | Actions | Important edge states |
|---|---|---|---|
| Accounts | local roster, search/filter, selected account inspector, related preset | import/save/edit/launch/delete favorite/preset | no session, busy client, locked vault, stale profile |
| Discover | champion grid, class/tag filters, search, saved collections, featured approved mods | inspect assets; save favorites; preview skins/chromas without claiming entitlement | offline cache, unavailable region or unapproved assets |
| Champion detail | hero splash, skins list, chroma swatches, forms, rarity info | inspect metadata, preview, set local preference if supported | copyrighted assets rights status |
| Presets | folders, per-account links, per-champion assignments, profile picker | create/clone/version/export/import/undo | dangling account ID, rename, cross-machine import |
| My Mods | installed, drafts, updates, quarantined, source/author/license metadata | import, verify, disable, export, delete, repair/rollback | duplicate hash, archive bomb, patch mismatch |
| Mod detail | preview, author, license, supported version/champion, file conflict map, dependency graph | verify, stage, apply via approved adapter, view diff, uninstall | adapter failure, unsupported game patch |
| Client Themes | surfaces editor, media library, color/font/music/transition controls, live preview | stage/activate/undo/remove theme | client running, unsupported loader, high video cost |
| Party | room code, membership, selected look, sync state, optional transfer approval | create/join/leave/approve/pause, copy invite | revoked invite, offline/reconnect, duplicates, mismatched hash |
| Creator | workspace browser, mod sources, archive explorer, visual diff, texture preview | import/extract/inspect/pack/export/save version | corrupted source, unsupported proprietary format |
| Creator Inspector | safe metadata editor, validation pane, compatibility report, rights/license | change metadata, lint, generate preview | no raw arbitrary runtime scripts |
| Community Shop | moderated catalog, categories, pagination, download receipts, creator identities | browse/download/report/like (verified only) | content removed, ownership verification, abuse |
| Friends/Discord | opt-in Discord RPC state, display name, party links | link/unlink/disable RPC | Discord unavailable, no OAuth tokens |
| Stats/OP.GG | provider-authorized profile summaries and link-outs | choose server, view allowed stats, refresh | quotas, unavailable API, policy constraints |
| AI/Voice | explicit model/provider choice, TTS permission, audio preview | opt in/out; type commentary prompt | privacy, price, rights, disabled in-game hints |
| Performance/Doctor | app/cache/adapter version, timers, workspace locks, health, diagnostics | scan, export redacted report, clear safe cache, restore backups | runtime degraded, no client |
| Settings | appearance, network consent, safe adapters, media budgets, updater, data export, privacy, about | preferences / revoke permissions | minimized/fullscreen, offline |
| About | LAAP logo, actual edition/version, legal/source licenses, privacy + updates | open legal docs / update | no deprecated 'Created by' credit |
| Migration | existing Team data inventory, permission checks, local export, sunset warning | migrate/backup/skip | cannot access server, active lease, tokens |
| Licensing | license status, receipt sync, offline grace, purchase options | activate/deactivate/restore | server down, chargeback, expired |

## Interaction / composition rules
- 960×640 minimum remains functional. Target inspect 960×640, 1160×760, 1440×900, maximized 1920×1080, 125/150% DPI.
- No 9px body type or 12 nested glass borders. Segmented controls <=3 state choices. Primary actions legible and singular.
- Catalog virtualized on large collections; media lazy-loaded; list and hero images need error placeholders and accessible names.
- Selected detail inspectors and creator property panes must hide/show and remember state; do not permanently monopolize 40% viewport.
- Each long-running operation has explicit progress/cancel/retry and safe concurrency; do not flash on background checks.
- All popovers keyboard accessible; focus restore, Escape, screen-reader status, reduced-motion behavior.
- No external image/font/CDN required for initial offline render.

## Component reusability guidance

`AppShell`, `PrimaryAction`, `GlassSurface`, `StatusIndicator`, `VirtualList`, `AssetCard`, `MediaPreview`, `HealthBadge`, `FileDropZone`, `InspectorPane`, `ApprovalDialog`, `ProgressTask`, `NetworkConsentGate`, `RuntimeCapabilityNotice`, `EmptyLibrary`, `RightsBadge`, `OfflineBanner` should have shared tokens, not duplicated local CSS implementations.
