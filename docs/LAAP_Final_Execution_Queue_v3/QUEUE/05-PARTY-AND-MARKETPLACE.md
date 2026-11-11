# TASK 05 — Finish online Studio services for a deployable community

## Current state

`apps/community-api` has real loopback WebSocket room management, reconnect, host transfer, consented ephemeral chat and a read-only approved catalog with SQLite reports/blocking. Production Studio/Complete binaries have no configured relay and CSP currently allows no connections. This is a real local foundation, not a hosted production service.

## Do now

1. Harden the existing relay (no rewrite without evidence): authenticated ephemeral membership, origin checks, rate limits, anti-replay/reconnect epochs, duplicate clients, expiration, host migration, server shutdown, abuse controls, permission transparency, 7–10-client stress and reconnect storms. Prove no Riot credential/profile ID/session/vault contents ever appear in messages, logs, analytics or API contracts.
2. Build consent-based room cosmetics synchronization from identifiers/content hashes, resilient against version and missing-mod mismatches. Implement allowed local mod hash lookup. Content transfer, if implemented, must be user-consented, rights-verified, malware-scanned, bounded, resumable and remotely disabled until all gates pass. Avoid default P2P IP disclosure.
3. Make community catalog actually maintainable: operator/creator authentication separate from Riot accounts, permission roles, submission and human review workflow, manifest verification, malware scans, licensing audit, creator profile, versioning, moderation dashboard, reporting, reviews/ratings after abuse checks, pagination/search and takedown invalidation. No Riot paid-assets redistribution or user account/session sync.
4. Prepare production deployment, pinned HTTPS/WSS endpoint configuration, exact CSP hosts, reverse-proxy/TLS/CSRF/auth limits, monitoring, metrics without sensitive data, backups, incident response, data retention/export/delete, rollback, moderation runbook and health checks. Deployment to an actual domain requires credentials/explicit authorization; with none, ship deployment-ready tested infrastructure and mark unavailable in production UI.
5. Verify full server/client integration with 7 concurrent clients, mobile/bad network conditions, member removal, room expiration, reconnect loss, moderation ban, corrupt downloadable archive, server outage and offline UI. Package downloads must be revalidated in Rust after network transfer. No dead buttons.

## Acceptance

- Real loopback WebSocket + HTTP behavior tested end-to-end with Studio/Complete client, independent of Team API.
- Production configs and CSP can be enabled for a verified hosted endpoint without arbitrary origin exceptions.
- Server does not accept Riot tokens; storage is separately governed; catalog takedowns persist across restart.
- If no domain/TLS/hosting is provided, features clearly say `Requires community service` and show no fake online data. Record exactly what remains external.
