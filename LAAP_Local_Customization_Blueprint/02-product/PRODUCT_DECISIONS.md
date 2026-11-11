# Product Decision Record — Local-First Pivot

## Agreed requirements

- Eliminate LAAP shared cloud/Team account switching and admin leases as an ongoing product.
- All existing player/account-management features in future editions operate against **local accounts** only.
- Offer customization with local account switching, customization by itself, or everything together, all from the same engine.
- Capture the breadth of Wildflover and Rose capabilities, including difficult features in a traceable backlog and explicit legal/anti-cheat gates.
- Premium UX and performance are product requirements; current Velvet Amethyst remains LAAP's starting visual identity.
- Be commercializable without falsely promising that copyrighted cosmetics or game-modification methods are lawful/approved.

## Recommended names and SKUs

| SKU | ID (proposal) | Includes | Excludes |
|---|---|---|---|
| `local` — LAAP Local | **keep** `com.laap.offline` | Local encrypted account vault, account switching, optional local catalog/presets, client themes, permitted custom-mod importer | Team/cloud leases; default public marketplace; creator studio; premium party services |
| `studio` — LAAP Studio | **new** `com.laap.studio` | Customization catalog, mod library, creator tools, client theme editor, party/marketplace if licensed and enabled | Local Riot account vault, account capture, session switching, Team sign-in |
| `complete` — LAAP Complete | **retain legacy** `com.laaP.desktop` for old Team upgrade path, pending migration gate | Every Local and Studio module, optional approved online features | Shared Riot accounts, cloud lease administration, session-blob upload |

**Why three SKUs instead of three codebases?** Shared Rust services, React features, manifest/version model, localization and tests. SKUs are compile-time capabilities; entitlements layer adds paid access only after required compliance.

## Existing Team installer ID

`com.laaP.desktop` is currently a published identity and updater channel `latest-team.json` is pinned into old builds. Do NOT change this ID just to rename the product. Migration plan: ship a migration-capable transitional signed version to `latest-team.json` (the old channel) which archives/safely disables Team functionality and exposes Complete. Only after every supported installed version can follow a new channel may `latest-complete.json` become the default. Never replace current user's Team sessions silently.

## Scope of the word "offline"

- **Offline accounts:** profiles and secure Riot sessions are stored exclusively on the user's machine.
- **Offline-capable:** opening the app, browsing cached legally obtained assets, editing themes/mods and switching already persisted local accounts works without LAAP cloud services (Riot login itself may require network).
- **Online optional:** GitHub updater, initial asset catalog, marketplace, invite/relay and voice/integrations need network; separately show status, privacy and consent.

## Mode and profile UX

`local`: top navigation Accounts | Discover | My Mods | Client Themes | Settings, with optional creator add-on, and account-specific preset binding.

`studio`: Discover | My Mods | Creator Studio | Client Themes | Party | Settings, **no Accounts/Vault** tab, no imported Riot session material, no account credentials settings.

`complete`: Accounts | Discover | My Mods | Creator Studio | Client Themes | Party | Settings. Account card details include an optional **Customization preset** selector and accurate readiness status.

## Hard scope boundaries

### Allowed to build as independent software (subject to local law/tool licenses and Riot policy)
- Metadata-only catalog and previews using permitted public static assets.
- Client themes and user-owned media, where the chosen loader's licensing and Riot rules allow.
- User-created mod library, inspection, import/export with permission; safe archive tools; configurable presets.
- Transparent companion integration with supported external manager/loader, opt-in and reversible.
- Opt-in party presence/selection synchronization with hashes and allowed user content.
- Creator preview, asset validation, conflict detector, compatibility lint, local packaging.
- Profile icon/background customization where supported and authorized.

### Gated for explicit rights and policy review — do not silently implement as "premium unlock"
- Unauthorized official paid-skin unlocking, "all skins free" or skinhack bypasses.
- Automated bans/picks/locks/ready-checks and gameplay-affecting overlays without policy clearance.
- Tainted binaries, silent LTK hijack, memory hooks, game process suspension, game asset spoofing.
- Automatic file sharing of nonredistributable Riot/third-party content.
- Gameplay appearance of TFT skins or champion visuals without a permitted integration path.
- AI-generated voice that reproduces celebrity/character voices without rights.

## Product advantages over both references

1. Local-first account-bound presets (without cloud session syncing).
2. Cross-feature preflight, reversible transactions and safe clean shutdown.
3. Rust content-addressed cache + eager metadata, lazy media; no bundled 203 MB hash index.
4. Native signed updates and deterministic health diagnostics across all SKUs.
5. First-class UI accessibility, error/retry/offline states, 22-language-ready localization.
6. Creator marketplace with moderation, hashes, version compatibility and creator rights attestation.
7. User-controlled privacy: relay by default, explicit party join and transfer approvals.
8. Workspace/party/preset backups excluding vault secrets.
9. Transparent third-party integration rather than hidden process hijack.
10. Accurate platform support: Windows patcher integration separately from macOS browsing/theme capabilities.
