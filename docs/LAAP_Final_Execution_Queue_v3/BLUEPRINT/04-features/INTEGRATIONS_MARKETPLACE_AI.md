**Edition scope v2.0:** This entire NEW feature family is for **LAAP Studio and LAAP Complete only**; it is NOT part of **LAAP Basic**. Basic remains the current local-account launcher. Where this document refers to an existing local account/preset binding, that extension applies **only in Complete**, not Studio. Online Studio services may remain available with appropriate consent, without remote Riot-account storage.

# Feature Spec — Community Catalog, OP.GG, Discord, AI/TTS, Settings and Performance

## Community marketplace

- Rights-cleared community mod catalog, upload/submission, moderation, preview image/video, filters, download receipts, favorites/likes, creator pages, reports, update/compatibility notices.
- API includes pagination, ETag, rate limiting, signed download URLs, fixed expiry, SHA-256 hash, content-type allowlist and cache lifecycle.
- Marketplace may offer creator-generated assets only with explicit redistribution/commercial rights. No protected Riot official skin assets or copied Wildflover catalog/database.
- Auto-updates for subscribed mods are previewed, changelogs reviewed and applied only after trust/compatibility validation and user consent.
- Creator shop payouts/commissions, if added, are a separate legal/merchant stage.

## OP.GG/statistics

- Allowed profile stats and links with provider authorization; do not scrape private APIs or assume OP.GG MCP is public/allowed.
- Show data source, timestamp, permission and region; caching/quota and redaction.
- Avoid competitive live enemy scouting, hidden information or automated advantage.
- Optionally launch official OP.GG link externally rather than proxying its API if no rights.

## Discord

- Rich Presence with activity/champion metadata (user opt-in). Party size and invite secrets only with permission, clear public visibility and revoke.
- Separate OAuth only when guild/member data truly needed; exact scopes and keychain token storage, CSRF state and PKCE.
- Do not share user account name/PUUID/Riot credentials by default.

## AI/TTS

- Optional noncompetitive help: mod metadata assistant, creator troubleshooting, permitted theme color suggestions, project documentation Q&A, accessible narration for UI.
- User chooses provider, costs and whether prompts/files leave device. Default local/off. No centralized uncontrolled proxies.
- For voice/TTS, approved ElevenLabs/StreamElements or similar with clear terms, user-owned rights and non-exploitative voice policy.
- No automated competitive real-time decision assistant, no voice impersonation, no live game hidden-data extraction.
- Data retention controls and local prompt redaction; abort/cancel and fallback when provider fails.

## Performance and settings

- Low-performance mode detection when actual game active; throttle media/network scans and animations; maintain update/download handoff safety.
- Safe global hotkeys, app startup/tray/notifications, per-SKU visibility of controls.
- Diagnostics: health report, adapter compatibility, cloud status, cache budget, clean-up and redacted support bundle.
- Preferences backed by a versioned schema, not localStorage scattered in components. Sensible per-feature opt-ins and reset with preview.

## Language and accessibility

- Rose currently describes 22 League languages; make 22-language-ready string extraction and translated coverage gates. Do not mark translations finished without translators/quality review.
- English/German/Arabic as initial QA locales if desired; RTL layouts tested; fallback strings never render as broken tags.
- Proper spoken labels, focus, keyboard navigation, reduced motion, effective contrast and font fallback for Arabic.

## Acceptance

- Network disabled: local roster, cached creator work and settings functional, no spinner loops.
- Feature disabled/unsupported: no hidden dead controls; graceful explanation.
- Consent revoked: sockets disconnect and pending transfers cancel.
- Provider down: cache/UX unaffected; no error spam.
- All remotely supplied text/media sanitized before display; no token logging.
