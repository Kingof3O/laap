# Security Policy

Security is a primary design pillar of **LAAP (League Account Access Platform)**. Because LAAP manages authenticated gaming profiles, strict boundaries are enforced to prevent account compromise, credential theft, and unauthorized access.

---

## Supported Versions

| Version | Supported          | Status |
| ------- | ------------------ | ------ |
| 0.2.x   | :white_check_mark: | Active |
| 0.1.x   | :x:                | Deprecated |

---

## Reporting a Vulnerability

If you discover a security vulnerability in LAAP, **please DO NOT open a public GitHub issue**.

Instead, report it through one of the following channels:
1. **GitHub Security Advisory**: Submit a private report via [Security Advisories](https://github.com/Kingof3O/laap/security/advisories/new).
2. **Direct Security Contact**: Email the maintainers with:
   - Clear description of the vulnerability
   - Proof of Concept (PoC) or reproduction steps
   - Assessment of potential impact

We will acknowledge receipt within **48 hours** and coordinate a fix and coordinated disclosure timeline.

---

## Architectural Security Guarantees

### 1. Zero Plain-Text Password Storage
- LAAP **never** prompts for, stores, hashes, logs, or transmits Riot account passwords.
- Authentication relies solely on ephemeral session tokens written by the official Riot Client into local YAML configuration files.

### 2. Ed25519 Hardware Device Authentication
- Every physical desktop client generates a unique Ed25519 cryptographic keypair stored in native OS hardware-backed storage:
  - **Windows**: Windows Credential Manager (`windows-native`)
  - **macOS**: Apple Keychain Services (`apple-native`)
- Claiming an account lease requires signing a time-bound server nonce (`timestamp:accountId`). Replay attacks or forged claims from unauthorized machines fail verification.

### 3. Mutual Single-Active Lease Enforcement
- Account pools enforce a strict database-level unique constraint (`idx_exclusive_account_session`).
- An account can never be leased to multiple operators or machines simultaneously.
- When an operator releases an account or the session expires, the local client scrubs all injected credentials and restores the user's personal configuration.

### 4. Process Sandboxing & Safe Teardown
- LAAP interacts only with Riot Client and League processes via standard OS process APIs (`sysinfo` and `Command`).
- LAAP does not inject memory DLLs, modify game binaries, or interact with Vanguard anti-cheat memory space.
