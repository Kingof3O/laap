**v2.0 SKU gate:** This phase is scoped to Studio and Complete only for new customization functionality. Basic must stay existing LAAP Offline with no new Studio features.

# P6 — Party rooms and Discord

**Purpose:** 7-person room metadata sync and reconnect/consent/transfer safety; no Riot vault sent to network.

## Required source inventory for this milestone

- `apps/community-api/package.json` — Optional separate relay API workspace and dependencies
- `apps/community-api/src/main.ts` — Server entry; no Riot vault or shared-account endpoints
- `apps/community-api/src/config.ts` — Separate room/connection/CDN secret config with validation
- `apps/community-api/src/routes/rooms.ts` — Membership lifecycle, token and expiry rules
- `apps/community-api/src/realtime/roomHub.ts` — WSS fan-out, sequencing, bounds and retention
- `apps/community-api/src/realtime/protocol.ts` — Protocol validation, replay/duplicate rejection
- `apps/community-api/src/storage/roomStore.ts` — Ephemeral room store with TTL and no Riot identity
- `apps/community-api/src/security/rateLimit.ts` — Rate limits and membership abuse protections
- `apps/community-api/src/security/auth.ts` — Short-lived room token verification
- `apps/desktop/src-tauri/src/party/mod.rs` — Native party service registration
- `apps/desktop/src-tauri/src/party/client.rs` — TLS/WSS relay client with backoff and offline handling
- `apps/desktop/src-tauri/src/party/room.rs` — State machine, invites, epoch/seq reconciliation
- `apps/desktop/src-tauri/src/party/transfers.rs` — Optional safe content transfer consent and checksum
- `apps/desktop/src/features/customization/party/PartyPage.tsx` — Room creation/join/member list and chat
- `apps/desktop/src/features/customization/party/MemberCard.tsx` — Peer state and selected permitted look
- `apps/desktop/src/features/customization/party/TransferApproval.tsx` — Rights/size/IP risk/approval modal
- `apps/desktop/src/features/customization/party/useParty.ts` — Room lifecycle hook with reconnection states
- `apps/desktop/src/features/customization/integrations/DiscordSettings.tsx` — Opt-in Discord presence and join controls
- `apps/desktop/src-tauri/src/integrations/discord.rs` — Scoped Discord RPC connector and no OAuth by default
- `apps/community-api/tests/room-chaos.test.ts` — 7-member stress/reconnect/duplicate and stale events
- `apps/desktop/tests/party-privacy.test.ts` — No local vault session/PUUID sent in room messages
- `apps/desktop/tests/ui/party.spec.ts` — Invitation, reconnect, consent and errors

## Implementation protocol

1. Read root `AGENTS.md`, relevant `04-features` specs and source/legality docs.
2. Recheck latest code; implement the listed files and supporting tests with no placeholders.
3. Check actual behavior, error/offline/rollback states and platform capability boundaries.
4. Run current frontend/Rust checks, source test suites and native platform tests where available.
5. Capture screenshots of affected UI at 960×640, 1160×760 and 1440×900; fix clipping/contrast and then freeze styling once accepted.
6. Track every related `FEATURE_PARITY_MATRIX.csv` row with evidence and policy decision.
7. Deliver diff, test logs, migration/rollback and external blockers; no fake native installation claim and no production release.

## Acceptance gate

7-person room metadata sync and reconnect/consent/transfer safety; no Riot vault sent to network.

See `06-delivery/QUALITY_GATES.md` and `06-delivery/IMPLEMENTATION_PLAN.md` for exact tests and sequencing. Do not claim this milestone complete if restricted features are just mock buttons or if the relevant external permissions are missing.
