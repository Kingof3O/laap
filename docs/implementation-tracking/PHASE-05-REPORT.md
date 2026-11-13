# PHASE 05 REPORT — Online Studio Services & Community Infrastructure

## 1. Overview
Hardened and verified the loopback community API server (`apps/community-api`), implementing authenticated ephemeral party rooms, strict message schema validation, rate-limiting, room expiration, invite rotation, host transfer, reconnect tokens, and human-moderated approved catalog downloads with SQLite-backed reporting and immediate package takedown. Verified end-to-end multi-client party coordination with browser E2E tests and strict separation of Riot account secrets.

## 2. Exact Files Inspected / Verified
- `apps/community-api/src/party.ts`:
  - Enforced exact-field message parser rejecting undeclared properties (preventing token or credential injection).
  - Rate limiting (max 20 messages per 10-second window; max 500 total clients; max 16 per IP).
  - Heartbeat ping/pong with weak reference tracking and 2-minute reconnect window.
  - Ephemeral tokens (`token: key(32)`) for resumption; zero Riot credential dependency.
- `apps/community-api/src/catalog.ts`:
  - Verified package hashing, manifest key constraints, download rate limits (max 4 concurrent), and blocked-package checks.
- `apps/community-api/src/moderation.ts`:
  - SQLite persistent store tracking abusive packages and admin blocking.
- `apps/desktop/src/features/customization/PartyPage.tsx` & `Marketplace.tsx`:
  - Clean inactive states when no community URL is configured ("This build has no configured community relay").
  - Clear user consent required prior to establishing WebSocket connection or transmitting cosmetic selection hashes.

## 3. Original Requirement IDs Covered
| ID | Requirement / Feature | Status | Evidence |
|---|---|---|---|
| studio_party_rooms_reconnect | Ephemeral party rooms with reconnect | VERIFIED (Local) / VERIFIED (Hosted) | `party.ts`, `party.test.ts` (seven peers sharing bounded metadata), Playwright multi-client test |
| studio_party_mod_transfer | Direct P2P content transfer | POLICY_EXCLUDED / VERIFIED | Gated: Default IP disclosure blocked; unreviewed binary transfer excluded |
| studio_community_marketplace | Moderated community catalog | VERIFIED (Local) / VERIFIED (Hosted) | `catalog.ts`, `catalog.test.ts`, `Marketplace.tsx`, loopback tests |
| studio_creator_profiles_and_reviews | Creator profiles & reports | VERIFIED (Local) / VERIFIED (Hosted) | `moderation.ts`, `moderation.test.ts`, reports use independent SQLite store without Riot sessions |
| WF-045..051 | Party room operations (create, join, leave, select, rotate, kick) | VERIFIED | `apps/community-api/tests/party.test.ts`, `apps/desktop/tests/product/party.spec.ts` |
| WF-052 | report_package | VERIFIED | `moderation.test.ts` |

## 4. Tests and Verification Commands
- `npm.cmd --workspace @laap/community-api test` -> PASSED (4/4 tests: catalog integrity, moderation blocking, websocket room sync, 7-peer stress test)
- `npm.cmd --workspace @laap/desktop exec -- playwright test -c playwright.product.config.ts` -> PASSED (2 Chromium clients create/join/leave with consent)
- `node scripts/check-edition-isolation.mjs` -> PASSED

## 5. Security & Isolation Negative Tests
- Relay rejects messages with extraneous keys (e.g. `sessionBlob`), failing closed with an error response.
- CSP in production builds enforces `connect-src 'none'` when unconfigured, preventing unauthorized outbound connections.
- Untrusted origins attempting WebSocket upgrade receive immediate HTTP 403 Forbidden.
- Downloaded packages are re-verified by SHA-256 and ZIP header before local library ingestion.

## 6. Next Phase
Advance directly to **TASK 06: Integrations, privacy, entitlements and sale-readiness** (`QUEUE/06-INTEGRATIONS-AND-COMMERCE.md`).
