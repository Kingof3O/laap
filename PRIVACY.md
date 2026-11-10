# Privacy policy

Updated 2026-11-11 for Basic, Studio, and Complete development builds from the official [GitHub repository](https://github.com/Kingof3O/laap).

## Local profile data and Riot login sessions

Profile names, regions, ranks, notes, favorites, cached images, and saved Riot account identifiers remain in LAAP's local app storage. Saved Riot login session material is encrypted at rest using a key held in the operating-system keychain. Metadata and cached images are not all encrypted. LAAP does not ask for a Riot password; the official Riot Client performs Riot sign-in.

When you import, refresh, or launch a profile, LAAP reads or temporarily writes Riot's session settings on the same computer. It can stop Riot/League processes before switching, with a confirmation when an active game executable is detected. Provisioning restores the original settings when canceled. Saved sessions are credentials; do not share vaults, session YAML, keychain contents, lockfiles, or logs containing credentials.

Uploaded profile pictures are resized and stored locally without their original metadata. They are not uploaded by LAAP. Deleting a local profile removes its saved record. Uninstalling may retain the local vault and asset cache; remove the app's user-data folder yourself if you want all local data erased. Details of storage and its limitations are in [Security model](docs/SECURITY_MODEL.md).

## Optional downloads and local League sync

Manual League icon downloads and enabled icon sync use Riot's Data Dragon HTTPS service. Requests identify the public icon/version being downloaded; LAAP does not send a Riot session or PUUID to Data Dragon. The remote service can see ordinary connection metadata such as the IP address.

Opted-in icon/rank sync reads the local League Client API on 127.0.0.1 using temporary local client credentials. A TLS exception is confined to that local self-signed client; public downloads keep normal TLS verification. LAAP checks the saved account's identity before updating it. Client credentials are not persisted or forwarded to the public asset service.

## LAAP Presence

Presence setup fetches and caches a public TLS compatibility certificate from `https://mln.cx/deceive/localhost.pfx`. A failed DNS route can query Google's DNS-over-HTTPS service for that provider's hostname. No profile data, Riot token, or chat content is sent to either service; those providers can see normal connection metadata. The certificate provider does not publish a privacy policy linked by the project, so it must not be described as having one.

The presence service uses local configuration/chat listeners and forwards the routed client's configuration and authenticated chat traffic to Riot's own services. Online/offline mode modifies global presence messages. Credentials and chat payloads remain in memory and are not logged or stored by LAAP. LAAP does not change the system trust store or install a root certificate. LAAP Presence prepares automatically on startup in Windows and macOS releases, including Basic. The local roster works independently from the optional network services described here.

## Updates and community services

Basic and Complete check GitHub on their existing native update channels. Studio checks its own channel. GitHub receives ordinary HTTPS request metadata. New desktop builds do not sign in to the legacy Team service or send Riot sessions to it. Older Team installations use the historical service and policies until migration. Its server and stored data have not been decommissioned by this change.

Studio and Complete can request public cosmetic metadata and images from Riot Data Dragon. The optional Community API is a separate service. Party rooms use temporary IDs and membership credentials held in memory. The relay can see the connection address, room membership, and explicitly shared cosmetic IDs. Room data expires after an hour. Loading and downloading approved packages discloses ordinary request metadata and package identifiers. The desktop sends no Riot session, vault contents, or local account identifier to the Community API. Community activity is optional and requires a configured service.

LAAP does not upload crash dumps automatically and does not include an advertising or analytics SDK.

## Signing and third-party services

SignPath is used only by maintainers' build/signing workflows after approval. The app itself never contacts SignPath. Only compiled artifacts and public source/build metadata are submitted for signing; local vaults and user sessions are excluded.

Third-party policies apply to their services: [Riot Games](https://www.riotgames.com/en/privacy-notice), [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), [Cloudflare](https://www.cloudflare.com/privacypolicy/), [Google](https://policies.google.com/privacy), and [SignPath](https://signpath.io/privacy-policy). Microsoft's [privacy statement](https://privacy.microsoft.com/privacystatement) applies to the WebView2 platform runtime. LAAP is unofficial and is not endorsed by Riot Games. Riot artwork retains its original rights; it is not LAAP's MIT-licensed code.

## Questions

Use [GitHub Issues](https://github.com/Kingof3O/laap/issues) for privacy questions. Report only sanitized details and never attach login sessions, passwords, access tokens, or private keys.
