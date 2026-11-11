**Edition scope v2.0:** This entire NEW feature family is for **LAAP Studio and LAAP Complete only**; it is NOT part of **LAAP Basic**. Basic remains the current local-account launcher. Where this document refers to an existing local account/preset binding, that extension applies **only in Complete**, not Studio. Online Studio services may remain available with appropriate consent, without remote Riot-account storage.

# Marketplace, Moderation, Support and Creator Operations

## Initial state

Marketplace is a **future opt-in online feature**. Its infrastructure must be designed but should not gate offline accounts, local mod import, creator preview or signed app updates. No Wildflover marketplace scraping/copying.

## Submission lifecycle

`Draft → Uploaded/Quarantined → Automated Validation → Human Moderation → Approved → Published → Deprecated/Takedown`.

Each submission includes rights/license text, copyright owner attestation, source repo if public, file hashes, supported game build, asset categories, screenshots, preview, provenance and author contact. Allow third-party reports and counter-notices per legal advice.

## Review gates

- Archive safety, no executable code/scripts, no concealed nested binaries/obfuscated payloads.
- Copyright/trademark/paid Riot content review and redistribution permissions.
- Gameplay integrity: no transparent models/advantage, map visibility hacks, sound cue manipulation that advantages users.
- Accessibility, abusive content and age/region policies.
- Creator identity and repeat violations, rate limiting and appeal mechanism.
- Build compatibility and mods that intentionally hijack the installer/loader denied.

## Download/trust

- Signed catalog metadata and SHA-256 immutable object path; optional CDN R2 with signed short-lived URL.
- Verify archive before import, isolate in quarantine and report license/author at install time.
- No automatic update to incompatible or revoked content; allow safe rollback.
- Cache invalidation and takedown propagate by content hash without scanning local personal vault.

## Commercial creator economics

Until rights/merchant processing and disputes solved: allow free approved community packs. Later consider creator storefront with KYC, refunds, payouts, revenue share and fee transparency; do not charge for licensed Riot assets. Track moderator hours, bandwidth spend and abuse rates; design payout ledger independent from Riot account identity.

## Support

- One-click redacted diagnostics: app version, SKU, OS, adapter status, mod hashes, error IDs, operation timeline and consent status. Never upload encrypted Riot session blobs, lockfile passwords or OS keychain secrets.
- Public docs for platform limitations, loader setup, mod quarantine, safe restore, broken game update, theme rollback, Windows Defender false-positive flow and refunds.
- Incident runbooks for compromised mod, malicious creator, leaked API secret, unauthorized content, broken release, multiplayer abuse and payment outage.
