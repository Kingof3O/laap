# Local Storage, Schema and Migration Design

## Store separation

1. **`local_store/laap_local_accounts.json`** — EXISTING encrypted session vault. No new media/cache fields except optional opaque preset reference. Schema migrations must preserve and test old format.
2. **`customization/v1/library.db`** — recommended SQLite metadata index for custom mods, rights, source, content hash, compatibility and installed state. This is a proposal; review SQLite Rust dependencies/size and cross-platform distribution.
3. **`customization/v1/content/sha256/<2>/<hash>`** — immutable content-addressed blobs for legal user assets; copy-on-write.
4. **`customization/v1/presets.json`** — user preferences and local account bindings; atomic versioned write. Consider SQLite if consistency/concurrency warrants.
5. **`customization/v1/themes/`** — user-owned theme assets and generated configuration; sandbox paths and permission grants.
6. **`customization/v1/state/`** — safe transaction journal, adapter state, update metadata and diagnostics; not encrypted session material.
7. **`customization/v1/quarantine/`** — raw imported files until validation; permission restricted; names normalized.
8. **`customization/v1/temp/`** — staged downloads/transfers; TTL GC; must not be scanned as installed mods.

## Core entities

- `ContentAsset`: sha256, size, MIME/detected format, source, rights/license, integrity, creation time.
- `ModPackage`: modId, versions, championIds, assetTypes, author, license, compatibility, dependency/conflict graph, contentAssetId, warning flags.
- `Preset`: presetId, displayName, enabledMods, championDefaults, skinPreferenceMetadata, clientThemeId, gameModeScope, applicableLocalAccountId?, priority, updatedAt.
- `Theme`: id, surfaces map, mediaReferences, font, animation, volume, accessibility fallback, userLicense, updatedAt.
- `GameInstall`: id/path/build/platform, lastValidatedAt, adapterCapabilities and health; no lockfile secrets persisted.
- `AdapterInstall`: toolName/version/signature/launch source/license/health; ownership and user consent.
- `PartyPreferences`: metadata sharing opt-in, reconnect policy, allowed transfer types, room display name; no persistent room tokens by default.
- `TransferReceipt`: file hash, peer pseudonym, rights attestation, bytes, status, TTL; redacted and retention limited.
- `Entitlement`: productId, signed claim, expiry/grace, revocation epoch; no stored customer payment card.

## Session and preset binding

Always use opaque existing `LocalAccount.id` to associate a `PresetRef`, not username, PUUID or cloud account ID. Studio has only `scope='global'|'champion'` and must never initialize LocalAccountStore. Complete may resolve preset after local account selection. Deleting an account unlinks the preset association but should not destroy the preset automatically.

## Migrations

- `schemaVersion` for JSON stores; sequential pure migration functions.
- SQLite `PRAGMA user_version`, transactional migrations with prior snapshot.
- Never write to new location and delete old store in same unverified transaction.
- Idempotent migration journal with checksum, `startedAt`, `completedAt`, `rollbackEligible`.
- Reject newer schema versions gracefully; do not destructively down-migrate unknown fields.
- Sensitive migration logs redacted: no session bytes, lockfile credentials, Discord tokens or private key material.

## Archive security (all imports and peer transfer)

- Validate magic bytes not extension. Restrict nested archive depth and total expansion ratio. Reject symlinks, absolute/UNC paths, path traversal, duplicate normalized names, Windows device names, alternate streams, oversized entries, suspicious executable payloads and unexpected scripts.
- Quarantine, hash and validate before exposing as installed. Extract to sandbox staging only; atomic commit after all checks.
- Store explicit rights metadata (`author`, `license`, `attribution`, `licenseUrl`, `allowsCommercialDistribution`, `modContainsRiotPaidContent=false`). These are declarations, not definitive legal proof; marketplace moderation must review.
- Never run arbitrary executables or Python scripts embedded inside imported archives. Creator format conversions execute audited, signed adapters only.
- Separate cache quotas and clear policies; never delete `laap_local_accounts.json`, keychain entries or user original mod files when clearing cache.

## Backup/export

- Export **presets, custom user-created assets, theme declarations and selected library metadata** to signed/checksummed archive. Vault sessions excluded by default and exported only through existing explicit vault procedure if available.
- Provide dry-run import showing additions, conflicts and overwrite choices; no remote sync without explicit user consent.
- Restore paths must be testable with corrupt/partial backups and with another local Windows user.
