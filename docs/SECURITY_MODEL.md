# Security and storage model

## Local profiles

LAAP does not accept Riot passwords. It captures session YAML produced by the official Riot Client. That material grants account access and should be treated as a secret.

`local_store/crypto.rs` encrypts session blobs with AES-256-GCM, random nonces, and associated data bound to the account ID. A random 32-byte vault key is stored in the native OS keychain. The JSON file retains profile names, regions, ranks, notes, favorites, dates, and customization references as readable metadata; cached icons are local PNG files. Backing up JSON alone does not preserve access to an OS-keychain-bound encryption key.

Vault operations use process and cross-process locks, unique temporary files, and atomic replacement. Corrupt records are preserved in quarantine files; a completely unreadable vault reports an error without discarding the original. Unix storage directories/files have restricted permissions. These measures do not protect against malware running as the same user or a compromised OS account.

Provisioning stages original Riot settings privately and restores them on cancellation. Managed launches save recovery information and an owner marker. Cleanup waits for clients to stop; failed process termination prevents destructive continuation. Stop Riot preserves saved login files rather than signing accounts out.

## Optional assets, update checks, and local-client sync

Local uploads are validated, cropped/resized, and converted to PNG without original image metadata. They are never uploaded. Public icon requests use HTTPS with normal certificate verification, validated asset identifiers, and no redirects. Network downloads require explicit user action or saved icon-sync opt-in.

Optional League Client sync reads ephemeral local credentials from its process arguments or nearby lockfile. Requests are read-only GETs to `https://127.0.0.1:<port>`, with proxies and redirects disabled. A self-signed certificate exception is scoped to that loopback client. Credentials are not logged, persisted, or sent to Data Dragon. Saved PUUID and opt-in flags are rechecked before writes; icon and rank sync are independent.

### Updates and Pro

The native updater checks GitHub for releases and verifies eligible Offline artifacts against the pinned update key. Installation checks for live matches and active provisioning before applying updates. The desktop webview enforces `connect-src 'none'`.

The billing Worker handles licensing, checkout, gifts, and device transfers. Pro access is cached locally as a signed lease bound to the installation. See [billing setup](../billing/README.md) and the [privacy policy](../PRIVACY.md).

## Native interaction boundary

LAAP does not inject code or inspect game memory. It inspects processes, can terminate clients after user consent, modifies session configuration while clients are stopped, and can perform opted-in local API reads while League Client is running. It is an unofficial session integration; these facts do not establish Riot approval or a ban guarantee.

See [native verification](ANTI_BAN_VERIFICATION.md) and [known validation limits](desktop-hardening-verification.md).

## Built-in presence transport

LAAP Presence adds an automatically prepared Windows/macOS loopback configuration/chat proxy. It uses a publicly trusted, locally validated compatibility certificate, normal upstream Riot TLS validation, and in-memory global-presence rewriting. It does not log/persist chat or authentication payloads. Automatic setup may contact the certificate provider and Google DNS-over-HTTPS for a failed DNS route. A routed client needs LAAP running until Stop Riot; closing its window retains the tray/menu-bar process. See [transport details and attribution](riot-installation-and-presence.md).
