**Edition scope v2.0:** This entire NEW feature family is for **LAAP Studio and LAAP Complete only**; it is NOT part of **LAAP Basic**. Basic remains the current local-account launcher. Where this document refers to an existing local account/preset binding, that extension applies **only in Complete**, not Studio. Online Studio services may remain available with appropriate consent, without remote Riot-account storage.

# Feature Spec — Champion Catalog, Skins, Chromas, Presets, History and TFT

## User promise

Browse champions, official skin/chroma **metadata**, legal previews and community-authored assets; organize selections and preferences for future use. Browsing is not equivalent to installing, unlocking or applying Riot paid skins; UI must never call it "owned" without an authorized ownership source.

## Catalog sources and schema

- Riot Data Dragon and other permitted static metadata; versioned by Riot patch and region where appropriate; translate display names with locale fallback.
- `Champion {id,key,name,tags,roles,icon,splash,patchVersion}`.
- `SkinMeta {skinId,championId,name,releaseDate,rarity,series,forms,chromas,legalityStatus,assetRefs[]}` where fields can be unknown; **never hallucinate**.
- `ChromaMeta {chromaId,skinId,displayName,colors,assetRefs[]}`.
- `CatalogSource {provider,license,sourceUrl,cacheVersion,updatedAt}`. External contributors require separate permission.
- `UserSelection {accountId?,championId,queueMode?,preferSkinMetadata?,customModHash?,chromaId?,selectionMode,updatedAt}`.

## Required workflows

1. Virtualized champion grid with search, filters by role, favorites, alphabet, last-used and recently added.
2. Champion page displays official skin metadata/previews, chroma swatches, forms and corresponding **approved** community-created alternatives.
3. Selection modes `Manual`, `Favorite`, `Random`, `History` and `Per-champion`, with deterministic seed for repeatable test; modes are preferences until actual apply adapter passes policy gate.
4. History records user-selected metadata only, not scraped restricted ownership or Riot account credentials. Separate histories by local account ID and game mode.
5. Smart owned-content handling: only infer genuine owned status from approved source; if absent show "ownership unknown". No bypass/unlock claim.
6. Champion Select suggestions: optional read-only selected champion signal and quick accessible in-client picker subject to loader/policy approval; default app still works standalone.
7. Handle skins with variants/forms without forcing all variants into unsupported mod formats.
8. Swiftplay, Quickplay, Classic Rift / additional queue-mode compatibility tracked; fall back gracefully where champ-select model differs. Do not claim support without tests.
9. TFT catalog/tiny legends/chibis/arenas metadata preview where legitimately published; in-match appearance changes policy-gated and default disabled.
10. Offer import of local metadata and offline cached catalog with source/version watermark; no network required after initialization.

## Preset hierarchy

- Named preset folders, tags, favorite, notes, preview, import/export, change log.
- Context: `global → per champion → per queue → per local account` with explicit priority and conflict resolution; user editable overrides.
- Profile cards show only compact active preset and readiness, with option to unlink/restore default.
- Deleting local account must not delete user-owned assets; unlink associations atomically.
- Local/Complete may link local account ID; Studio has no account selector.
- No account rename and reimport side effects, never store PUUID in remote party metadata.

## UX details

- Built-in Velvet Amethyst assets; large preview only when space allows, lazy thumbnails, keyboard search, accessible swatches, descriptive alt text.
- Rich no-results, offline, download-progress, invalid metadata, rights issue and unsupported integration states.
- Copy current selection to another account, bulk edit, undo history, batch revalidate.

## Tests

- Versioned Data Dragon schema; unexpected nulls; 10k items; all 22 locale fallback paths; wrong patch metadata.
- Preset resolver priority; deletion/orphan recovery; deterministic random/history selections.
- Offline/no-network; target platform and game install missing; cache corruption auto recovery.
- Ownership unknown never becomes "owned"; no official-skin unlock or bypass function reachable.
- Accessibility at 960×640; fuzzy search without frame drops.
