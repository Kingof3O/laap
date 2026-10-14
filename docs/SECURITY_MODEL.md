# Security and storage model

Checked against v0.4.3 source on 2026-10-14. This describes implementation boundaries, not a security certification.

## Local profiles

LAAP does not accept Riot passwords. It captures session YAML produced by the official Riot Client. That material grants account access and should be treated as a secret.

`local_store/crypto.rs` encrypts session blobs with AES-256-GCM, random nonces, and associated data bound to the account ID. A random 32-byte vault key is stored in the native OS keychain. The JSON file retains profile names, regions, ranks, notes, favorites, dates, and customization references as readable metadata; cached icons are local PNG files. Backing up JSON alone does not preserve access to an OS-keychain-bound encryption key.

Vault operations use process and cross-process locks, unique temporary files, and atomic replacement. Corrupt records are preserved in quarantine files; a completely unreadable vault reports an error without discarding the original. Unix storage directories/files have restricted permissions. These measures do not protect against malware running as the same user or a compromised OS account.

Provisioning stages original Riot settings privately and restores them on cancellation. Managed launches save recovery information and an owner marker. Cleanup waits for clients to stop; failed process termination prevents destructive continuation. Stop Riot preserves saved login files rather than signing accounts out.

## Optional assets and local-client sync

Local uploads are validated, cropped/resized, and converted to PNG without original image metadata. They are never uploaded. Public icon requests use HTTPS with normal certificate verification, validated asset identifiers, and no redirects. Network downloads require explicit user action or saved icon-sync opt-in.

Optional League Client sync reads ephemeral local credentials from its process arguments or nearby lockfile. Requests are read-only GETs to `https://127.0.0.1:<port>`, with proxies and redirects disabled. A self-signed certificate exception is scoped to that loopback client. Credentials are not logged, persisted, or sent to Data Dragon. Saved PUUID and opt-in flags are rechecked before writes; icon and rank sync are independent.

Offline Edition disables cloud authentication/API/update polling and enforces this webview CSP:

```text
default-src 'self'; img-src 'self' data:; connect-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'
```

The CSP applies to the webview, not native Rust clients. Offline Edition can still make explicit Data Dragon downloads and opted-in local LCU connections. It must not be advertised as unconditional zero network traffic.

## LAAP authentication and leases

LAAP user passwords are hashed server-side. Browser authentication uses HttpOnly cookies; production cookies are Secure and SameSite=Lax. Trusted Tauri origins receive bearer tokens, optionally persisted in the OS keychain. Login sessions last 15 minutes or seven days when remembered. Logout clears the browser cookie/native stored token; the API does not revoke an already-issued JWT server-side.

Ed25519 private keys stay in the OS keychain. The lease route verifies a signed `timestamp:accountId` challenge when nonce, signature, and device ID are supplied. The accepted timestamp skew is five minutes. Unsigned requests are also supported by the current route; service checks still enforce device authorization, account availability, and assignment/admin access. Timestamp checking is not a one-time replay cache.

Shared session blobs are encrypted at rest with an application vault key. Authorized lease owners receive decrypted session material over the API. Server-side roles and PostgreSQL lease constraints enforce access and single-active claims. Heartbeats and stale-session reaping handle abandoned leases. Audit records support operational review; no cryptographic tamper-evidence guarantee is implemented.

## Native interaction boundary

LAAP does not inject code or inspect game memory. It inspects processes, can terminate clients after user consent, modifies session configuration while clients are stopped, and can perform opted-in local API reads while League Client is running. It is an unofficial session integration; these facts do not establish Riot approval or a ban guarantee.

See [native verification](ANTI_BAN_VERIFICATION.md) and [known validation limits](desktop-hardening-verification.md).
