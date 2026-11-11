**Edition scope v2.0:** This entire NEW feature family is for **LAAP Studio and LAAP Complete only**; it is NOT part of **LAAP Basic**. Basic remains the current local-account launcher. Where this document refers to an existing local account/preset binding, that extension applies **only in Complete**, not Studio. Online Studio services may remain available with appropriate consent, without remote Riot-account storage.

# Optional Party, Marketplace, Licensing and Online Architecture

## Critical distinction: online party is NOT online Riot account mode

Shared accounts are retired. Party rooms, content distribution, Discord RPC and commercial entitlements may use new minimal network services. They MUST NOT store, transfer, request or log Riot session blobs, refresh tokens, account passwords, encrypted vault files or LCU credentials.

## Party design

- Default room protocol: **metadata-only relay**, over TLS/WSS, with short-lived authenticated room membership and optional anonymous pseudonymous guest identity.
- `room_id` random opaque identifier; share invite code rotating and rate-limited; avoid exposing PUUID/Riot IDs by default.
- Room state: member list, version, compatible app/mod versions, selected cosmetic metadata, skin/chroma IDs (display-only), locally available user-created mod SHA-256, transient chat.
- Client keeps `lastSequence` and `roomEpoch`; state sync on reconnect, idempotent event handling, bounded retries and timeouts.
- Membership join/leave/ban/host transfer, expiry, inactivity TTL, anti-spam, moderation and audit without collecting game credentials.
- Consent for sharing; without matching hashes show "Not installed" rather than silently downloading.
- Share content with a friend only if creator license/rights allow redistribution. Default transfer disabled. Direct P2P exposes IP; prefer relay/download proxy or documented consent/choice. No UPnP/NAT invasive setup by default.
- If content-transfer implemented: chunk limits, SHA-256 final check, filename/path sanitization, quota and malware scanning, receiving-user opt-in, resumable bounded transfers, safe cancel. Never stage unvalidated content into game.

## API surface (proposal)

```
POST   /v1/rooms                -> create room with TTL and scoped token
POST   /v1/rooms/{id}/join      -> join with invite code
GET    /v1/rooms/{id}/snapshot  -> authorized room snapshot
POST   /v1/rooms/{id}/leave     -> release membership
WS     /v1/rooms/{id}/events    -> authenticated room stream
GET    /v1/catalog/mods        -> licensed public metadata, pagination
POST   /v1/catalog/mods        -> authenticated creator submission, moderation queue
GET    /v1/catalog/mods/{id}   -> version/rights/hash/preview metadata
POST   /v1/catalog/mods/{id}/report -> abuse/intellectual-property complaint
POST   /v1/commerce/webhooks/{provider} -> signature-validated server-to-server webhook
POST   /v1/entitlements/activate -> rate-limited activation; no Riot login
POST   /v1/entitlements/revoke   -> self-service revoke
GET    /v1/service/health       -> limited health, no credentials
```

All endpoints have documented authentication, rate limits, payload limits, abuse controls, privacy policy and tests; no generic `execute` or `proxy LCU request` endpoint.

## Community marketplace

- Creator verified identity, ownership attestation, license, moderation status, version tags, supported champion/patch, source hash, preview image/video, dependency tree, content warnings.
- Object storage (e.g. Cloudflare R2) is for **rights-cleared community mods and user-created previews only**. Upload private/quarantine; malware and policy scan before publication; signed downloads with checksum and immutable file names.
- Liking, favorites, approved download counts, creator analytics and reports require anti-abuse and privacy controls.
- Support report/takedown appeal/DMCA contact and fast removal of violating content; caching invalidation and blocklist verification.
- Never host extracted official paid skins or redistribute copyrighted game WADs.

## Commerce/licensing

- Payment provider acts as Merchant of Record where approved. Client gets a short signed entitlement claim with SKU/features/version, no payment card details.
- Payment webhooks verified with HMAC/signature/replay defense and idempotency key; never trust UI receipt alone.
- Offline grace for authenticated purchases, recoverable license, reactivation limits that allow normal reinstall; no hostile DRM.
- Marketplace creator payout needs seller KYC/tax/refund support and content rights; leave gated until counsel, moderation, processor approved.

## Security/privacy

- OIDC/OAuth tokens in OS keychain, never in local library JSON or party log.
- Public keys, app IDs and copyright notices not secrets; all private keys and service credentials in managed secrets.
- Rate limit by IP/room/account without indefinitely storing identity. Encrypt backups and audit retention.
- Disallow arbitrary executable uploads, script execution in media previews, HTML injection, user-controlled URLs in privileged native commands.
- Studio without Riot vault cannot access session files or invoke account IPC; dedicated process capability tests required.
