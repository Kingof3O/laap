# Studio and Complete — Real Online Services Acceptance

**Online community features stay in scope**, even though **Riot cloud/shared-account mode is permanently retired**. The agent may not substitute static local mock data or disabled 'coming soon' screens and claim parity.

| Service | Studio | Complete | Real test requirement |
|---|---|---|---|
| Moderated catalog and CDN mod downloads | Yes | Yes | Authenticated/anonymous browsing as permitted, consented download, checksum and rights checks, offline cache |
| Party rooms/selection sync | Yes | Yes | Real WebSocket create/invite/join/leave/reconnect, multiple clients, duplicate join and outage tests |
| Optional content transfer | Conditional | Conditional | Reject unauthorized content and malware, explicit transfer approval, safe resume/timeout |
| Discord OAuth/Rich Presence | Optional | Optional | Real OAuth callback, credential revocation, offline/error UI; no Riot vault forwarding |
| Stats integration | Conditional | Conditional | Real provider-approved call, rate limits, graceful 401/429/500/offline |
| TTS/AI | Conditional | Conditional | Consent, provider key storage, privacy, billing safeguard, no gameplay exploits |
| Premium entitlements | Conditional | Conditional | Verified merchant webhook, signed entitlement, offline grace, refunds/revocation |
| Signed updates | Yes | Yes | Correct matching edition manifest and native installed upgrade |

Privacy: no Riot login account, session blob, lockfile credential, encrypted vault file or managed Riot token crosses the Community API. Ordinary Riot/game authentication remains Riot's responsibility.

Offline handling: local creator library, saved packages/themes and cached catalog work with no community connection. Explicit status/Retry button for hosted features rather than loading loops. No online service should be mandatory for app launch (except intentionally gated commercial licensing services with documented grace).
