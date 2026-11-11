# Typed IPC and Event Contracts — Design-Only Interface Specification

**Not yet implemented.** Agent must reconcile with actual Rust/TypeScript code and codegen conventions, then write tests enforcing these contracts.

## Common response

```ts
type AppErrorCode = 'CAPABILITY_UNAVAILABLE'|'USER_CONSENT_REQUIRED'|'POLICY_GATED'|
  'OS_UNSUPPORTED'|'ADAPTER_NOT_INSTALLED'|'ADAPTER_INCOMPATIBLE'|'GAME_BUSY'|
  'ARCHIVE_UNSAFE'|'RIGHTS_MISSING'|'ASSET_CONFLICT'|'CHECKSUM_MISMATCH'|
  'NETWORK_UNAVAILABLE'|'LICENSE_UNAVAILABLE'|'CANCELLED'|'INVALID_INPUT'
type AppResult<T> = { ok:true; value:T } | { ok:false; error:{code:AppErrorCode;message:string;retryable:boolean} }
```

## Proposed native commands

| Domain command (proposed) | Input → output | Availability | Side effects |
|---|---|---|---|
| `get_product_capabilities` | no input → versioned capability map | all | none |
| `catalog_get_version` | locale? → catalog version | all | cached read |
| `catalog_search` | query/filter/cursor → page of Champion/Skin metadata | all | optional approved metadata fetch |
| `catalog_get_champion` | championId, locale → detail | all | cached read |
| `customization_preset_list` | scope/accountId? → summary[] | all; Studio account scope forbidden | read |
| `customization_preset_save` | strict Preset JSON → id/version | all; Local/Complete account binding | atomic write |
| `customization_preset_resolve` | accountId?/championId?/mode → resolved config | all | read |
| `mod_import` | user-picked safe local path + consent → taskId | all | quarantine, validate, index |
| `mod_list` | filters/pagination → safe summaries | all | read |
| `mod_get_report` | hash → validation/conflict/rights | all | read |
| `mod_remove` | modId, keepOriginal → result | all | unlink/GC; preserve original |
| `mod_stage_apply` | modIds, targetInstall, explicitConfirm → taskId | optional compatible policy-approved Windows adapter | external tool; reversible |
| `mod_adapter_status` | no input → capability + health | all | safe query |
| `theme_list` | no input → ThemeSummary[] | all | read |
| `theme_save` | strict Theme JSON → version | all | atomic write |
| `theme_preview` | theme id → preview token | all | local only |
| `theme_apply` | themeId + userConfirmed → taskId | installed approved adapter & consent | client theme, reversible |
| `creator_project_open` | selected local project path → project metadata | Studio/Complete | sandboxed inspect |
| `creator_export` | project id + rights license → content hash | Studio/Complete | legal user package generation |
| `party_create` | room privacy settings → room token | opted-in compatible | optional WSS |
| `party_join` | invite code, consent → member state | opted-in compatible | optional WSS |
| `party_leave` | room token → result | opted-in | disconnect/expire |
| `party_transfer_approve` | transferId, rights receipt → bounded taskId | opt-in, rights approved | quarantine network download |
| `doctor_collect` | redaction level → diagnostic summary | all | read/optional output file |
| `license_get_status` | no input → signed SKU state | all | cached read |
| `task_cancel` | taskId → result | all | safe cancellation where supported |

## Native events

`laap:catalog-updated`, `laap:mod-import-progress`, `laap:mod-health-changed`, `laap:theme-status`, `laap:gameflow-phase`, `laap:party-state`, `laap:party-message`, `laap:task-progress`, `laap:adapter-status`, `laap:consent-changed`. Payload includes `eventVersion`, `taskId`/domain ID, `state`, `timestamp`, `seq` for ordered streams and **no Riot account secrets**.

## Authorization

Studio must reject any `local_accounts`, `get_local_account`, `launch_local_account`, `capture_active_session`, `save_local_account`, `inject_account_session` invocations by absence of compiled handler registration/capability, not only React route hiding.

## Security of path-bearing commands

Webview cannot provide arbitrary absolute path for internal reads/writes. User picker grants a single file handle/path to a scoped operation; server/native validator canonicalizes, constrains to configured roots, denies symlinks/UNC/path traversal, and never invokes arbitrary shell command strings.
