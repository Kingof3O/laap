# Retire Online Shared Riot Accounts, Keep Online Studio Services

## Two completely different kinds of "online"

### Removed: cloud Riot account collaboration
- Team Vault, remote Riot profile pool, pooled session blobs, account assignments, admin/operator sharing, lease acquire/heartbeat/release, Team account device management, API account sync, shared-password-like session distribution.
- Any new session capture/refresh/launch always reads local encrypted store only; Complete never uses legacy Team API to launch an account.
- The old service/data is preserved only during authorized migration and eventual decommissioning.

### Kept: Wildflover-style internet features in Studio and Complete
- Signed updater/manifest delivery, catalog metadata and community previews
- Moderated marketplace with creator downloads, reviews/likes/reports/takedowns
- Party WebSocket relay, room invitations, synchronization of permitted selections, opt-in safe package transfers
- Discord OAuth/Rich Presence and provider-authorized summoner/stats integrations
- Creator profiles, ratings and license entitlements, payment checkout/receipt validation, optional AI/TTS
- Offline cached mods/themes/presets remain functional when service is unavailable.

## Boundary design

`Basic <-> Local vault only` (plus its existing normal Riot, rank/icon and update connections)

`Studio <-> CustomizationStore <-> CommunityAPI` (no vault, no saved Riot login tokens)

`Complete <-> LocalVault (local-only)` AND `<-> Studio CustomizationStore <-> CommunityAPI` (only opaque local preset references bind the two stores)

No network API, party event, crash report, license check or Discord payload can carry `session_blob`, Riot access/refresh token, lockfile password, decrypted vault keys or encrypted copies of the same secrets. Schema validation and outbound request audit enforce this in Rust and server tests. Party accounts/creator identities are NOT Riot-account logins.

## Exact CI tests
1. Exhaustively list Tauri commands in each build; Basic lacks all `customization_*`/`party_*`/`marketplace_*` commands; Studio lacks `save_local_account`/`launch_local_account`/`get_local_account`/`capture_active_session`; Complete exposes both approved sets.
2. Block all calls to legacy `/api/leases`, `/api/accounts`, `/api/assignments` from production app flavors. Test network capture during account launch and parties: no session blob/Tokens/PUUID outflow.
3. Turn off network: Basic still opens/switches stored profiles subject to normal Riot server availability; Studio and Complete can browse cached approved assets and use local mod/creator functionality.
4. Turn on network: Studio+Complete can complete actual authenticated party-room join/leave, marketplace page fetch and receipt validation; Basic never loads the new community SDK.
5. Validate consent/revoke/data deletion and retention for online community features. Never silently send account identifiers.
6. Verify no legacy Team login prompt appears and old shared-account dashboard is not reachable as an active product UI.
