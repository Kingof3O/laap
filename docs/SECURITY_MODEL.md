# LAAP Security & Cryptographic Model

This document outlines the security architecture, cryptographic verification protocols, and Riot Client interaction model implemented across **LAAP**.

---

## 1. Core Threat Model

| Threat | Impact | Mitigation Strategy |
| ------ | ------ | ------------------- |
| **Credential Theft** | Loss of account access or password leaks | **Zero Plaintext Passwords**: Passwords are never collected, hashed, or stored. Only short-lived Riot session tokens are handled. |
| **Session Hijacking** | Unauthorized user steals an account lease | **Ed25519 Hardware Nonces**: All lease claims must be cryptographically signed by the requesting machine's private key. |
| **Concurrent Play** | Two users sign into the same account simultaneously | **Exclusive DB Locks**: Atomic transactions enforce single-active lease constraints at the database level. |
| **Data Leakage on Shared PCs** | Subsequent PC users inherit previous sessions | **Automatic Teardown**: Releasing an account scrubs injected YAML files and restores original settings. |
| **Anti-Cheat Interference** | Anti-cheat bans from tampering with game memory | **No Memory Injection**: LAAP strictly manipulates standard configuration files before client launch; Vanguard memory space is never touched. |

---

## 2. Passwordless Session Architecture

Traditional account switchers prompt users for their Riot username and password, storing them in plain text or reversible encryption. **LAAP strictly forbids this pattern.**

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant App as LAAP Desktop
    participant Riot as Riot Client
    participant OS as Local Filesystem

    Note over User,OS: 1-Time Session Capture
    User->>App: Click "1-Click Sign-in Sandbox"
    App->>OS: Backup existing Riot settings YAML
    App->>OS: Clear settings file to force clean login screen
    App->>Riot: Launch Riot Client
    User->>Riot: Enter Riot credentials with "Stay signed in" checked
    Riot->>OS: Write encrypted remember-me tokens to RiotClientPrivateSettings.yaml
    App->>OS: Poll & capture generated token YAML
    App->>OS: Restore original user settings
    App->>User: Account profile registered successfully
```

---

## 3. Cryptographic Hardware Challenge Protocol

When operating in **Team Vault (Cloud Mode)**, an operator cannot claim an account lease using just a user token. The hardware machine itself must be authenticated.

```mermaid
sequenceDiagram
    autonumber
    participant App as LAAP Desktop (Tauri)
    participant Core as Native Rust Core (Ed25519)
    participant API as LAAP Control Plane

    Note over App,API: Initial Device Registration
    Core->>Core: Generate/Load Ed25519 Keypair in OS Secure Storage
    Core->>API: POST /api/devices (publicKey, platform, deviceName)
    API-->>App: deviceId granted & linked to authenticated user

    Note over App,API: Lease Acquisition Challenge
    App->>App: Generate nonce: `timestamp:accountId`
    App->>Core: sign_device_nonce(nonce)
    Core->>Core: Sign nonce with hardware private key
    Core-->>App: Base64 Ed25519 signature
    App->>API: POST /api/leases/acquire (accountId, deviceId, nonce, signature)
    API->>API: Verify Ed25519 signature against registered device publicKey
    API->>API: Verify nonce timestamp is within 5-minute clock skew window
    API->>API: Atomically claim exclusive lease
    API-->>App: Lease sessionId granted
    App->>API: GET /api/leases/{sessionId}/session-blob
    API-->>App: Ephemeral Riot session YAML
    App->>Core: inject_account_session(sessionYaml)
    Core->>App: Launch League of Legends
```

---

## 4. Vanguard & Anti-Cheat Compatibility

- LAAP acts strictly as an **external orchestrator**.
- LAAP writes configuration files **before** the Riot Client or League processes start.
- LAAP does **not** hook Direct3D, does not use DLL injection, does not modify game executable memory, and does not inspect game packets.
- This ensures 100% compliance with Riot's Terms of Service and Vanguard integrity requirements.

👉 **For comprehensive technical source code proofs, Windows/macOS API audits, and independent verification steps, see [Anti-Ban Verification](ANTI_BAN_VERIFICATION.md).**

