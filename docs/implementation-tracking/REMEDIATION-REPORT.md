# LAAP functional remediation — NO-GO

Date: 2026-11-11. Baseline: `93ed1fbce023e2b2493ed565d6d306c8fff8c2f7`.
Code checkpoint: 06d71c3c2fbb449dc2d990833a8302916f3b22f5. Local commits only; no push, release, installer build, production signing, deployment, payment, production database operation or live Riot account action.

The complete blueprint is **not finished**. This execution implements targeted security and workflow remediation. The full installed-app journeys, creator suite and all 131 parity requirements are not verified. Previous acceptance reports and existence-based VERIFIED claims must not be treated as current proof.

## Implemented and exercised

- Marketplace: remove default admin credential; require explicitly injected 256-bit hex key and timing-safe comparison; fail closed when absent/weak. Protect pending catalog and moderation audit. Bind submissions to authenticated creator and actual archive bytes. Scan ZIP structure, paths, quotas, expansion, types, entry sizes/digests and whole SHA-256. SQLite BLOB storage, transactional submission, human review, revalidation on approve, concurrent-review change detection, approved-only downloads and persistent takedown/restore audit. Request/concurrency/storage quotas and unique authenticated editable/deletable reviews. Existing legacy review rows remain in their original table; new authenticated reviews use a separate unique table. No destructive duplicate cleanup. This is local SQLite content storage, not an R2 deployment or a malware/rights certification.
- Marketplace desktop: registration, recovery token sign-in, OS-keychain persistence, disconnect, submission status, upload from a verified redistributable local package, real Bearer authentication, honest pending status, bounded streamed download, cancellation before native finalization, selected-hash/right checks, and success only after native import resolves. No invented ratings or random creator identities.
- Archives: native inspection calculates actual archive and entry digests, requires explicit author/license declarations, preserves source bytes/format, accepts safe explicit directories, and rejects corrupted, executable or unsafe content. Index-backed package export repaired. Nested original Fantome/Modpkg import/export/reimport and stage/rollback run on the actual Windows filesystem. Binary game formats are opaque stored assets; full parsing/conversion is not claimed.
- Staging: game-install targets rejected. App-owned generations, atomic active receipt, bounded expansion/generation count, file hashes, link/reparse-point checks and rollback ownership preflight. Modified/unrelated files are preserved. A failed next stage preserves the preceding generation. No MODS_OVERLAY or League activation claim.
- Relay: server-issued independent transfer IDs, requested announced hashes, explicit sender approval, original redistributable manifest, bounded chunks/aggregate bytes/concurrency, ordered reconstruction, duplicate handling, full server archive validation, client SHA check and native import. Progress reaches 100 only after import. Disconnect/cancel clears transfers; reconnect requires a fresh request. This is relay transfer, without byte-level resume.
- Discord: presence-only local IPC replaces unfinished desktop OAuth/client-secret handling. Numeric application ID, Windows named pipes/Unix sockets, READY handshake, matching SET_ACTIVITY nonce/ack and deadlines. No new OAuth tokens. Legacy plaintext token fields are scrubbed at customization startup/config load; cleanup failure is reported without secrets. Disconnect drops the IPC connection. Live Discord visibility is not verified.
- Providers: OS-stored keys, explicit consent/provider choice, output/text/response bounds, timeout, cancellation for AI/TTS, typed error codes and no automatic billed retries. OpenAI Responses and Gemini Interactions adapters use documented schemas. ElevenLabs output is decoded through Symphonia, with invalid/empty/silent/overlong output rejected; playback/stop/replay/download uses the local audio player. Official Riot stats use encoded Riot ID segments, explicit platform routing, five-minute cache and error handling without invented ranks. No OP.GG or unsupported StreamElements success claim.
- Themes: replace incompatible frontend palette contract with Rust's actual fields; persist active themes, restore at startup, apply actual canvas/surface/accent/type tokens and permitted local media. Native media ownership/size/header/dimension validation, palette import/export, undo/redo/reset, bundled font choices, OS/application reduced motion and media performance toggle. Studio/Complete CSP permits local media only. League-client themes are separate and unavailable.
- Complete presets: general Studio clears prior account context; successful switches update context; opaque-ID references persist and are checked against the current roster; renames follow the same ID. Deleted accounts unlink presets on next native list and preserve the presets. Three-ID resolution/unlink unit coverage added. Preset conflict response mismatch corrected.
- Creator: enforce persisted JSON/assets quota and integrity on save/export, prevent executable assets, retain errors from recovery writes, preserve metadata edits before export and remove the false signed-package claim. Full creator completion remains outstanding.
- Evidence: replace hardcoded statuses with the 131-row manifest, real command logs, source fingerprints, log digests, exact passing test IDs and explicit dependency classification. Missing/stale/failed/changed artifacts fail validation. Ignored tests and source-name text cannot count as a passing test. No requirement is promoted to full VERIFIED here.

## Edition status

| Edition | Current evidence | Completion |
|---|---|---|
| Basic | 53 native tests passed, 3 ignored, 2 signing-CLI tests filtered; 25 browser regression tests passed. Local vault/session code preserved; fixture migration/encryption and lifecycle protections pass. Frontend bundle excludes Studio/Team. | Installed user upgrade and live Riot workflow NOT VERIFIED. |
| Studio | 48 native tests passed, 2 ignored, 2 signing-CLI tests filtered. Native feature gate and frontend bundle exclude account vault/launch/Presence. Three browser remediation tests pass with real community HTTP and fixture native IPC. | Supported local workflows improved; full customization product NOT COMPLETE. |
| Complete | 90 native tests passed, 5 ignored, 2 signing-CLI tests filtered. Shared Basic/Studio code and opaque local preset links tested. | Three-account installed native UI lifecycle NOT VERIFIED; inherits Studio gaps. |

These are test-build feature sets and frontend production bundles, not three installed native applications. Existing pinned updater keys and installation/channel identities were retained. No installer or installed upgrade is asserted.

## Verification results

- Rust: Basic 53 / Studio 48 / Complete 90 passing executions, zero failures in the final artifacts. External network/resource/native TLS tests remain ignored as recorded. Two tests that invoke the signing CLI are filtered in the recorded final runs; no production artifact is signed.
- Community API: 9 real HTTP/WebSocket/SQLite tests pass, including auth, ownership, immutable bytes, moderation, legacy review preservation, malicious archives, seven peers, reconnect, transfer corruption and cancel.
- Browser: 25 existing Basic tests pass; 3 new Studio tests pass (real local HTTP registration/upload/approval/download, fixture native import acknowledgement; theme state restoration; native-shaped conflict rendering). Native IPC in these browser tests is a fixture and does not prove native WebView installation.
- TypeScript: desktop project build and Community API typecheck pass.
- Frontend units: 43 tests pass for sorting, updater contracts, Complete context and bounded downloads.
- Evidence validator: 3 unit tests pass for stale/failure/tamper rejection and actual result parsing. 131 canonical requirement records generated successfully from current mapped artifacts.
- Three production frontend builds and identity/import-isolation checks pass. No packaging, release signing, installed upgrade or deployment was run.

Raw logs and source-hashed execution records: `evidence/`. Exact commands are recorded in each JSON. Full changed-file paths: `REMEDIATION-CHANGED-FILES.txt`.

## Required journey evidence

| # | Journey | Result and scope |
|---|---|---|
| 1 | Preserve encrypted local vault | Existing temp-vault migration, encryption, corrupt-record preservation and lifecycle tests pass. Real installed user upgrade NOT TESTED. |
| 2 | Studio operates without vault | Rust feature tests and built frontend isolation pass. Installed native IPC attack journey NOT TESTED. |
| 3 | Complete three-account context | Three-ID resolution, rename, deletion unlink and priority tests pass. Full native switch/restart journey NOT TESTED. |
| 4 | ZIP/Fantome/Modpkg intake | Actual Windows temp filesystem nested archive inspection/import passes. UI-native cancellation NOT COMPLETE. |
| 5 | Export/reimport | Original nested archive bytes preserved; SHA/files revalidated. Full creator-format edit roundtrip NOT TESTED. |
| 6 | Conflicts/stage/rollback | Native generation/ownership and failed-next-stage tests pass; browser conflict schema rendering passes. No game activation. |
| 7 | Filesystem escape rejection | Native traversal/device-name tests plus actual Windows junction rejection pass. No live installation targets used. |
| 8 | Creator project lifecycle | Integrity/quota/save/export corrections implemented. Full import/autosave/recovery/undo lifecycle NOT TESTED/INCOMPLETE. |
| 9 | Proprietary format tools | Full WAD/BIN/SKN/SKL editing/conversion NOT IMPLEMENTED. Opaque data storage does not establish format support. |
| 10 | Theme create/apply/restart | Browser rendering/restoration with fixture IPC and native validation tests pass. Installed app persistence/media journey NOT TESTED. |
| 11 | Theme media/fonts | Media validation, bounded local reading and reduced motion implemented; Manrope load checked in browser. Full GIF/video duration/decode, custom fonts and theme music NOT COMPLETE. |
| 12 | Two-client transfer/native import | Real relay transfers valid original archive; native importer tested separately. Two installed-client journey NOT VERIFIED; no byte resume. |
| 13 | Seven-peer rooms/reconnect | Real WebSocket seven-peer/chat and single-member resume tests pass. Multi-device chaos/reconnect-storm journey NOT TESTED. |
| 14 | Authenticated marketplace | Real HTTP/SQLite workflow and browser UI with fixture IPC pass. Full installed native download/import journey NOT TESTED. |
| 15 | Marketplace abuse/quotas | Wrong/missing admin, wrong creator, non-uploaded hash, malformed/oversized body, request quota, corrupt archive and review ownership cases pass. Exhaustive fuzzing/security audit NOT COMPLETE. |
| 16 | Reports/takedown/restart | Persistence/blocking/audit tested. Full moderation dashboard, operator roles and privacy deletion/export NOT COMPLETE. |
| 17 | AI provider | Real local HTTP schema/output fixtures and cancellation registry pass. Live credentials/access/response quality NOT TESTED. |
| 18 | Speech/stats/Discord | Invalid audio rejected with real decoder; Riot HTTP fixture and Discord duplex ACK tests pass. Live speech, stats and Discord NOT TESTED. |
| 19 | Crash/offline/large collections | Existing vault recovery and bounded imports pass; prior stage preserved on failure. Full crash recovery, 500 packages and measured CPU/memory/startup NOT TESTED. |
| 20 | Three installed products | Three native test builds and frontend bundles verified. Installed Windows/macOS E2E, co-install and upgrade NOT TESTED. |

## Migration and compatibility

Existing Riot vault schema, OS keychain service/key, account IDs and trusted updater keys are unchanged. No live user vault was opened by tests. Windows credential tests use a uniquely named fixture entry, then remove that entry. All archive/stage fixtures use temporary directories. No Riot or LAAP process was killed for packaging.

Community schema additions are additive. Legacy hash-only submissions need real bytes and renewed human review before becoming downloadable. Legacy reviews are retained unmodified in `reviews`; only new authenticated records in `marketplace_reviews` contribute to the new public workflow. This avoids destructive de-duplication and avoids treating legacy anonymous ratings as trusted identity proof.

Studio data remains isolated from the local account vault. Complete stores opaque profile IDs only in preset/context references; portable preset exports clear account bindings. Legacy Team backend/data and updater transition feeds remain intact; active new desktop bundles exclude Team routes.

## Remaining internal work — not external blockers

- All 131 rows are traced, but many remain untested. Broad parity audit, actual end-to-end journeys and regression evidence are incomplete.
- Archive import task cancellation, crash/quarantine recovery, durable cleanup of interrupted generations and richer dependency/compatibility resolution need completion. Modified staging files are preserved with errors rather than silently removed.
- Creator autosave/recovery selection, undo/redo, portable project import, deterministic comprehensive exports, real supported texture/model/BIN/WAD tools, previews and batch operations need completion.
- Marketplace creator profile editing UI, version/changelog relationships, pagination/search controls, moderation dashboard/roles, privacy export/deletion and operational abuse coverage need completion.
- Themes lack full custom-font and music workflows, robust complete media validation/duration/recovery and the reference theme-count parity. Client appearance adapter remains separate.
- Catalog metadata still needs complete provenance/patch/locale/cache/unsupported-field journeys, validated forms/TFT contracts and live large-catalog checks. Missing metadata must not be represented as ownership or no variants.
- Full UI localization/RTL coverage, ordinary startup/hotkey/priority features, broad diagnostics and measured native performance remain unverified or unimplemented.
- Native WebView2/screenshots, Complete's full switch/context lifecycle and cross-edition installed regression journeys remain unexecuted.

## External gates

Live provider keys/account permissions and an actual Discord desktop/application must be available to verify live integrations. A trusted community domain/TLS/host and moderation operations must be configured for production connectivity; current production CSP remains default-deny for remote service connections. No service was deployed.

Game-modifying/client adapters require an actually supported permitted interface, licenses, compatibility and applicable approval; no game hooks, process hijacking, paid-skin unlocks or anti-cheat bypass is supplied. Automatic gameplay actions are excluded by corrected feature policy.

Native clean-machine Windows/macOS upgrade/co-install evidence and any future authorized production signing/release are separate gates. They were not executed in this request. Missing credentials do not explain or excuse the internal gaps listed above.

## Visual evidence and performance

Saved and inspected rendered Chromium screenshots: `screenshots/marketplace-browser-http.png`, `theme-browser-960.png`, `theme-browser-1160.png`, and `theme-browser-1440.png`. These contain original fixture data and fixture native IPC, not live accounts or native WebView2 evidence. One visible zero-rating issue was corrected to “No ratings yet”; a mismatched preset response crash was fixed and covered by a rendering test. Canvas tokens now affect the actual app background rather than unused CSS variables.

No native startup/CPU/RSS or large-collection performance certification is made. Bounds are explicit: native archive 32 MiB, expanded archive 128 MiB, library 512 MiB, community package 12 MiB, bounded relay concurrency/aggregate bytes, media 32 MiB with 256 MiB media storage quota, and decoded voice at most two minutes. Build duration/chunk sizes are recorded in bundle logs; those are build measurements, not user-experience benchmarks.

## Feature matrix

Current strict completion tally: 0 VERIFIED, 42 PARTIAL, 63 NOT_TESTED, 15 NOT_IMPLEMENTED, 11 POLICY_EXCLUDED. No external blocker label is used to conceal unfinished ordinary code.

`FEATURE-STATUS.csv`, `../LAAP_THREE_EDITION_PARITY_EVIDENCE.csv` and `remediation-evidence.json` contain all 131 IDs with implementation, registration, actual mapped execution and limitations. Full feature status is conservative; passing helper tests do not certify a whole product feature.

| ID | Feature | Status |
|---|---|---|
| WF-001 | save_persistent_state | PARTIAL |
| WF-002 | set_minimize_to_tray | NOT_TESTED |
| WF-003 | set_auto_launch | NOT_IMPLEMENTED |
| WF-004 | get_file_info | PARTIAL |
| WF-005 | write_error_report | NOT_TESTED |
| WF-006 | open_folder_in_explorer | NOT_TESTED |
| WF-007 | set_install_directory | NOT_TESTED |
| WF-008 | clear_install_directory | NOT_TESTED |
| WF-009 | set_developer_mode | NOT_TESTED |
| WF-010 | show | NOT_TESTED |
| WF-011 | download_skin | POLICY_EXCLUDED |
| WF-012 | download_tft_skin | POLICY_EXCLUDED |
| WF-013 | activate_mods | PARTIAL |
| WF-014 | cancel_activation | PARTIAL |
| WF-015 | set_game_path | NOT_TESTED |
| WF-016 | run_skin_fixers | POLICY_EXCLUDED |
| WF-017 | scan_custom_mod | PARTIAL |
| WF-018 | apply_fixed_fantome | NOT_IMPLEMENTED |
| WF-019 | is_selection_fresh | NOT_TESTED |
| WF-020 | bridge_debug_log | NOT_TESTED |
| WF-021 | bridge_send | POLICY_EXCLUDED |
| WF-022 | delete_cache_file | NOT_TESTED |
| WF-023 | delete_custom_mod_cache | NOT_TESTED |
| WF-024 | invalidate_fixed_mod_cache | NOT_TESTED |
| WF-025 | delete_marketplace_mod_cache | NOT_TESTED |
| WF-026 | delete_custom_mod_storage | NOT_TESTED |
| WF-027 | save_thumbnail_to_disk | NOT_TESTED |
| WF-028 | get_thumbnail_from_disk | NOT_TESTED |
| WF-029 | delete_thumbnail_from_disk | NOT_TESTED |
| WF-030 | test_thumbnail_disk_storage | NOT_TESTED |
| WF-031 | read_file_chunk | PARTIAL |
| WF-032 | save_p2p_chunk | PARTIAL |
| WF-033 | finalize_p2p_transfer | PARTIAL |
| WF-034 | cleanup_p2p_transfer | PARTIAL |
| WF-035 | r2_fetch_catalog | PARTIAL |
| WF-036 | r2_get_download_url | PARTIAL |
| WF-037 | r2_download_mod | PARTIAL |
| WF-038 | r2_like_mod | NOT_IMPLEMENTED |
| WF-039 | r2_increment_download | PARTIAL |
| WF-040 | r2_get_preview_url | NOT_IMPLEMENTED |
| WF-041 | r2_fetch_preview | NOT_IMPLEMENTED |
| WF-042 | check_marketplace_mod_exists | PARTIAL |
| WF-043 | skinlab_skins | NOT_TESTED |
| WF-044 | skinlab_read | NOT_TESTED |
| WF-045 | skinlab_mod_open | NOT_TESTED |
| WF-046 | skinlab_mod_close | NOT_TESTED |
| WF-047 | skinlab_locales | NOT_TESTED |
| WF-048 | skinlab_wad_sizes | NOT_TESTED |
| WF-049 | skinlab_mod_rows | NOT_TESTED |
| WF-050 | skinlab_has | NOT_TESTED |
| WF-051 | read_fantome_meta | PARTIAL |
| WF-052 | write_fantome_meta | PARTIAL |
| WF-053 | list_fantome_contents | PARTIAL |
| WF-054 | analyze_wad | NOT_TESTED |
| WF-055 | wad_to_fantome | POLICY_EXCLUDED |
| WF-056 | extract_fantome | PARTIAL |
| WF-057 | export_mod_as_fantome | NOT_TESTED |
| WF-058 | export_custom_mod_as_fantome | NOT_TESTED |
| WF-059 | bin_to_py | NOT_IMPLEMENTED |
| WF-060 | py_to_bin | NOT_IMPLEMENTED |
| WF-061 | wad_unpack | NOT_IMPLEMENTED |
| WF-062 | wad_pack | NOT_IMPLEMENTED |
| WF-063 | client_themes_save_asset | PARTIAL |
| WF-064 | client_themes_save_asset_path | PARTIAL |
| WF-065 | client_themes_pick_media | PARTIAL |
| WF-066 | client_themes_clear_asset | PARTIAL |
| WF-067 | client_themes_set_music_options | NOT_TESTED |
| WF-068 | client_themes_pick_font | NOT_TESTED |
| WF-069 | client_themes_set_font_preset | PARTIAL |
| WF-070 | client_themes_clear_font | NOT_TESTED |
| WF-071 | client_themes_set_transition | PARTIAL |
| WF-072 | lcu_test_connection | NOT_TESTED |
| WF-073 | lcu_request | NOT_TESTED |
| WF-074 | lcu_get_gameflow_phase | NOT_TESTED |
| WF-075 | lcu_set_game_path | NOT_TESTED |
| WF-076 | lcu_automation_set_config | POLICY_EXCLUDED |
| WF-077 | team_overlay_push | NOT_TESTED |
| WF-078 | team_overlay_set_hotkey | NOT_TESTED |
| WF-079 | match_notice_show | NOT_TESTED |
| WF-080 | match_notice_ready | NOT_TESTED |
| WF-081 | match_notice_action | NOT_TESTED |
| WF-082 | open_discord_oauth_window | NOT_IMPLEMENTED |
| WF-083 | discord_exchange_code | NOT_IMPLEMENTED |
| WF-084 | discord_refresh_token | NOT_IMPLEMENTED |
| WF-085 | discord_revoke_token | PARTIAL |
| WF-086 | set_rpc_enabled | PARTIAL |
| WF-087 | update_activity | PARTIAL |
| WF-088 | rpc_set_presence | PARTIAL |
| WF-089 | ai_chat | PARTIAL |
| WF-090 | elevenlabs_tts | PARTIAL |
| WF-091 | streamelements_tts | NOT_IMPLEMENTED |
| WF-092 | opgg_get_summoner_profile | PARTIAL |
| WF-093 | register_hotkey | NOT_TESTED |
| WF-094 | set_performance_mode | NOT_TESTED |
| WF-095 | set_app_low_priority | NOT_TESTED |
| EX-096 | Skin and chroma selection wheel | NOT_TESTED |
| EX-097 | Random and Historic per-champion preference | NOT_TESTED |
| EX-098 | Smart owned-skin detection | NOT_TESTED |
| EX-099 | Forms wheel / variants | NOT_TESTED |
| EX-100 | Loading-screen skin-name replacement | NOT_TESTED |
| EX-101 | 22 League client language support | NOT_IMPLEMENTED |
| EX-102 | Quickplay and Swiftplay and Classic Rift modes | NOT_TESTED |
| EX-103 | Late champion-lock detection | NOT_TESTED |
| EX-104 | Duplicate joins and reconnect storm handling | PARTIAL |
| EX-105 | Share custom mod by content hash | PARTIAL |
| EX-106 | Native in-client party panel | NOT_TESTED |
| EX-107 | Incomplete update rollback | NOT_TESTED |
| EX-108 | Safe loader activation/deactivation after restart | NOT_TESTED |
| EX-109 | Custom map mods | NOT_TESTED |
| EX-110 | Font/announcer mods | NOT_TESTED |
| EX-111 | Import .modpkg .fantome .zip | PARTIAL |
| EX-112 | 2100+ skins and 7000+ chromas showroom | NOT_TESTED |
| EX-113 | 15 built-in app themes and user-defined images | PARTIAL |
| EX-114 | 16 customizable League client surfaces | NOT_IMPLEMENTED |
| EX-115 | 200+ community mods | NOT_TESTED |
| EX-116 | 7-member direct P2P room and ephemeral chat | PARTIAL |
| EX-117 | Auto accept ready check | POLICY_EXCLUDED |
| EX-118 | Auto ban and auto pick and auto lock | POLICY_EXCLUDED |
| EX-119 | Profile background and icon change | NOT_TESTED |
| EX-120 | TFT chibis Little Legends arena looks | NOT_TESTED |
| EX-121 | Ranked/social leaderboard | NOT_TESTED |
| EX-122 | Lobby music and video/gif backgrounds | PARTIAL |
| EX-123 | Fast repeat selection warm cache | NOT_TESTED |
| EX-124 | Per-local-account customization presets | PARTIAL |
| EX-125 | Safe package rights scanner and conflict graph | PARTIAL |
| EX-126 | Three commercial product flavors | PARTIAL |
| EX-127 | Retire Team shared account mode | PARTIAL |
| EX-128 | Profile/asset encrypted vault separation | PARTIAL |
| EX-129 | LeagueToolFlop.dll headless Win32 hook and spoof | POLICY_EXCLUDED |
| EX-130 | ltk_base_skin.py anti-skinhack normalizer | POLICY_EXCLUDED |
| EX-131 | Game process suspension while patcher prepares | POLICY_EXCLUDED |

**Decision: NO-GO for complete-product readiness.** Internal implementation and verification gaps remain. Code, tests, raw evidence and screenshots are available for review; no completion or release claim is made.
