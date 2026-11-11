# TASK 06 — Integrations, privacy, entitlements and sale-readiness

## Current state

Discord/stats/AI/TTS, creator accounts and paid entitlements were not implemented in audit baseline. Riot/third-party commercial permission, payment provider and service credentials are not already granted simply by the user's acceptance of game account risk.

## Do now

1. Add clean provider interfaces for opt-in Discord Rich Presence/OAuth (PKCE and secure token storage), approved stats APIs (follow rate limits, registered keys and caching), optional AI/TTS services with user-owned keys or consented server-side proxy (never place shared secrets in app), retry/backoff, revocation, offline UX, provider terms, resource/time budgets and ability to disable completely. When no provider credentials exist, test contracts via local deterministic fixtures but do not label production integration live.
2. Provide optional original creator profiles, content ownership/rights attestations, moderation workflow and privacy controls. Separate these from Riot IDs, LAAP local account identifiers and saved Riot sessions.
3. Introduce edition-aware paid capabilities only after maintaining free Basic: Studio/Complete paid entitlements verified in the native/backend boundary, signed grants, device changes, revocation, offline grace and recovery, purchase restoration, refund/cancellation semantics and anti-replay validation. No payment token or PCI data in the local vault. Use a real payment-provider sandbox and verified webhooks; if merchant not connected, leave checkout disabled. No self-asserted client flags granting premium features.
4. Prepare licensing and IP inventory. Existing public LAAP code is MIT; preserve those permissions and notices. Inventory inherited GPL-3.0 LTK Manager code and LTK Patcher's separate terms; don't bundle proprietary Wildflover code. Require attribution, distribution rights, publisher identity and a third-party binary inventory for every installer. Prefer independently written original features and external user-installed integrations when permitted. Do not strip another publisher's signature without a proper license/security process.
5. Prepare Riot Developer Portal product registration/audit application materials, an accurate permitted-features list, clear non-affiliation and risk disclosures, privacy policy, terms, support/refunds and free-tier outline. Riot approval/Acknowledged status and provider/merchant authorizations are external outcomes; record them as external blockers, not software defects to work around.
6. Run sandbox webhooks and entitlement security tests, token expiration and revocation tests, provider outage/consent tests and data-flow audit. Fix real failures.

## Acceptance

- Real provider connections only marked `VERIFIED` with live authorized credentials; other integrations are complete-to-gate with safe inactive UI and exact onboarding instructions.
- Basic remains functional without paid license, community API or internet account.
- No Riot account material leaves device, no secrets embedded in JS, and audited free/paid boundaries cannot be bypassed by simple UI state changes.
- Commercial launch marked GATED until Riot/product/legal/merchant approvals are actually obtained.
