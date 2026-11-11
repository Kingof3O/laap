# Feature Spec — Party Synchronization, Optional Transfers, Chat and Discord

## Reference parity

Wildflover website: room code, up to 7 peers (marketing claim), P2P missing-mod transfer, room chat, matching looks. Dossier lists chunked transfer IPC and direct networking. Rose current releases: room matchmaking, robust reconnection, duplicate account defenses, compatibility across Swiftplay/Quickplay and matches, custom mod matching hashes, in-client party panel.

## Party core UX

- Create/join/invite, show room code and membership, per-member current **permitted cosmetic selection metadata** and custom mod hash availability.
- Show clear privacy choices and real connection health (`connected`, `retrying`, `offline`, `blocked`, `version mismatch`).
- Room leader revoke/rotate invite, member mute/kick where relevant; rate-limited short ephemeral chat if user enables.
- Single membership per device, optional multiple local profiles supported without impersonation.
- Historical selection and party state resets on leaving; chat expires per policy.
- Host transfer and room expiration not dependent on Riot cloud accounts.

## Reliable protocol

`Hello → Authenticated Join → Snapshot(epoch, seq) → Delta Event(seq) → Ack → Reconnect(snapshot/sinceSeq) → Leave/Expire`.

Events: `member.joined`, `member.left`, `selection.changed`, `mod.hash.available`, `mod.transfer.requested`, `mod.transfer.approved`, `transfer.progress`, `chat.message`, `room.closed`, `protocol.upgrade_required`. Each event has `roomId`, `eventId`, monotonically increasing `seq`, `schemaVersion`, bounded TTL and payload length. Do not broadcast Riot auth/PUUID/account email by default.

## Transfer strategy — not P2P by default

1. Announce content hash + legal rights flag; receiving peer checks local library.
2. If missing, **request approval**; show size, creator, rights, source and IP-privacy tradeoff.
3. Prefer signed CDN/relay download for moderated and licensed content, with rate limits and hash verification.
4. Optional user-to-user transfer may be built only for user-authored distributable packages, with secure transport, explicit user permission, quotas, receipt tracking and awareness that IP may be exposed in direct P2P.
5. No automatic repacking/export of Riot official paid content; no auto-install until validate/quarantine.

## Discord integration

- Separate Discord Rich Presence (game/champion/party size) from Discord OAuth; for RPC only, official SDK may avoid full user OAuth.
- Local opt-in, clear visibility that activity may appear publicly, easy disconnect and disable.
- Invite/join actions must not leak unauthorized room or game identity; rotate secrets and validate.
- Handle Discord unavailable silently without breaking account launcher.

## Tests

- 7 peers, reconnection storms, 2 devices same person, duplicate join, stale sequence, conflicting selection, join expired, missing content, hash mismatch, blocked sharing, network loss, room recovery, cancellation, zip attack, privacy revocation.
- Confirm offline account vault remains operational and unexposed while party service is down or compromised.
- Test that other **nonparticipants** see no cosmetic changes; party sync remains local/shared only among opted-in clients where support exists.
