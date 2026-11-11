**Edition scope v2.0:** This entire NEW feature family is for **LAAP Studio and LAAP Complete only**; it is NOT part of **LAAP Basic**. Basic remains the current local-account launcher. Where this document refers to an existing local account/preset binding, that extension applies **only in Complete**, not Studio. Online Studio services may remain available with appropriate consent, without remote Riot-account storage.

# Third-Party Licensing, Game Integrity, Privacy and Approval Gates

**Not legal advice.** Needs qualified legal/Riot Developer Relations review before commercial publication. Explicitly avoid representing the plan as approved by Riot.

## Existing LAAP ownership

- Root `LICENSE`: MIT, 2026 copyright attribution. Already-published versions are MIT, permitting redistribution and sale with required notices. Do not retroactively claim no-copy rights.
- Confirm contribution provenance/assignments for all code and design before dual-licensing new modules.
- New proprietary features may be separately licensed by actual rights-holder only; keep clean module boundaries and comply with third-party licenses.

## Third-party dependency matrix

| Project/data | Observed license | Distribution/integration decision |
|---|---|---|
| LAAP existing repo | MIT | Preserve notices; derivative work can be commercial but existing version still public MIT |
| Rose repo | MIT | Study architecture; permitted code reuse with license attribution and review; **not** a policy waiver for features |
| LTK Manager source | GPL-3.0-or-later | Do not copy into proprietary LAAP core unless obligations analyzed and honored |
| LTK Patcher binaries | Separate `LTK-PATCHER-LICENSE.md` | Permission subject to binary signing conditions; no silent repackaging/borrowed publisher signature |
| Pengu Loader | MIT reported on GitHub | Verify actual shipped component licenses and current platform policy; user-consented installation |
| Riot Data Dragon | Riot Developer terms | Allowed usage not unrestricted republication; required disclaimers and registration |
| Riot game assets (.wad, official skins) | Riot proprietary | Do not resell/rehost/extract to distribute paid content without rights |
| Wildflover extracted files | Proprietary/third party mixed | No copying of DLL, Python normalizer, logos, catalog, secret tokens or proprietary UI |
| Third-party music/fonts/creator media | Per-asset | User-owned or suitable licenses, store metadata + attribution |
| OP.GG/Discord/AI providers | APIs/terms | Use current official authorized SDK/APIs and consent, do not scrape private endpoints |

## Riot registration and marketing

- Register all player-facing products/features even without documented API (per 2026 League policy page).
- Need approved/acknowledged status for monetization plus free tier and transformative paid value; verify product-specific constraints with Riot.
- Riot explicitly warns about skin hacks and third-party program enforcement. Recent 2026 memory-access changes tighten risk of game-memory techniques.
- No claims "100% anti-cheat safe," "zero ban risk," "Riot approved," "unlock all skins for free," "invisible/undetectable," or "immune to DMCA."
- Do not copy Riot Client appearance so closely that users assume official endorsement. Include required attribution/disclaimer in app and website.
- Account sharing and selling credentials violate Riot terms; retiring Team account mode reduces risk but does not automatically legitimize all local session automation.

## Data privacy and consent

- New cloud party users are pseudonymous; room data expires. No PUUID/Riot credentials needed. Chat optional and ephemeral.
- Clipboard/invite links, IP disclosure, community uploads, media source URL, Discord activity, AI prompts and crash logs get separate consent notices.
- Store locally by default, encrypt sensitive OAuth tokens, minimize network metadata, allow export/delete and explain what remains after uninstall.
- Payment processor is MoR; LAAP backend handles entitlements, not card details.
- Avoid exposing local loopback server to LAN or unauthenticated web content; ephemeral origin-bound token and restrictive CORS.

## Ship gate checklist

- [ ] Permission to monetize confirmed or Riot product status Approved/Acknowledged and free tier.
- [ ] Current feature set matches product registration and Riot policy scope.
- [ ] No forbidden official paid-skin unlock / anti-skinhack bypass / game-memory operations in SKU.
- [ ] All bundled third-party binaries have redistribution rights and correct signing/provenance.
- [ ] GPL compliance review completed and notices included.
- [ ] No proprietary Wildflover bytes, code, screenshots or assets shipped.
- [ ] Marketplace creator and consumer licenses, takedown policy and uploader proof in place.
- [ ] No exploit/automation without explicit approved scope.
- [ ] Website ToS, Privacy, Refunds, Support, risk disclosure and independent-app disclaimer published.
- [ ] App and installer signed; native Windows/macOS E2E and safe rollback verified.
