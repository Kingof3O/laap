# LAAP System Architecture & Technical Design

## 1. System Overview & Boundaries

LAAP enforces strict separation of concerns between presentation, domain contracts, atomic state brokering, and native process execution:

```text
┌────────────────────────────────────────┐       ┌──────────────────────────────────────┐
│       LAAP Desktop Launcher            │       │       Web Control Center             │
│   (Tauri + Rust + Hextech React 19)    │       │     (React 19 + Tailwind CSS)        │
└──────────────────┬─────────────────────┘       └──────────────────┬───────────────────┘
                   │                                                │
                   │ typed DTOs & Zod contracts                     │ typed DTOs
                   ▼                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                    Shared Packages (@laap/types, @laap/validation)                     │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │ authenticated HTTP / Bearer / Cookies
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│              LAAP Core API (Node HTTP / Cloudflare Worker: laap-api)                  │
│               - SQL.js Adapter (Local Development Persistence)                        │
│               - Supabase Adapter (Production PostgreSQL & RLS Engine)                 │
└──────────────────────────────────────────┬────────────────────────────────────────────┘
                                           │
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│            Supabase Cloud Infrastructure (PostgreSQL, Vault, Auth, RLS)               │
│               - Atomic lease acquisition functions (Postgres RPC)                     │
│               - Row Level Security (RLS) enforcement on all tables                    │
│               - Encrypted session blob storage & admin bypass policies                │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Passwordless Session Sandboxing Architecture

### The Problem with Password Injection
Traditional account management tools store plaintext or weakly encrypted Riot account passwords and attempt to inject them using keystroke simulation or memory scraping. This approach introduces major security vulnerabilities, triggers anti-cheat flags, fails on multi-factor authentication, and exposes player accounts to credential theft.

### The LAAP Session Token Solution
LAAP operates exclusively at the **authenticated session layer**:

1. **How Riot Client Maintains Sessions:**
   When a user signs into Riot Client with *"Stay signed in"* enabled, Riot writes an authenticated session token into the client configuration file (`RiotClientPrivateSettings.yaml`).
2. **One-Time Capture (Sandbox Mode):**
   - **Local Capture:** The user clicks *"Capture Active Riot Login"* (which grabs the current active session without asking for credentials) or *"Open Riot Sign-In Sandbox"*.
   - In Sandbox mode, LAAP opens a fresh, isolated Riot Client process. The user enters their credentials once.
   - LAAP detects the newly generated session token, stores it in the encrypted local vault (or uploads it to the Team Vault if performed by an admin), and closes the sandbox.
3. **1-Click Launch (Session Injection):**
   - When launching an account, LAAP backs up the user's personal `RiotClientPrivateSettings.yaml`.
   - It injects the account's authenticated session YAML.
   - It boots the Riot Client / League of Legends launcher. The client boots directly into the game without prompting for a password.
4. **Automatic Rollback & Cleanup:**
   - When the user releases the account or clicks *"Restore Personal Riot Client Settings"*, LAAP cleans up the injected credentials and restores the player's personal profile.

---

## 3. Atomic Lease Brokering & Concurrency Control

In **Team Vault (Cloud Mode)**, account access is strictly regulated:

1. **Atomic Postgres RPCs:**
   Lease acquisitions execute inside a serialized PostgreSQL transaction (`acquire_lease_for_user`).
   - Verifies user role or active operator assignment.
   - Confirms the account is currently `available`.
   - Creates an active lease row with a duration timestamp.
   - Atomically transitions the account status to `leased`.
2. **Partial Unique Indexing:**
   A partial unique index (`WHERE status IN ('starting', 'active')`) guarantees that **no account can ever have more than one active lease concurrently**.
3. **Cryptographic Device Challenge-Response:**
   - Every desktop client creates an Ed25519 keypair stored in the native OS keychain (`keyring-rs`).
   - When acquiring a lease, the client signs a server nonce (`${timestamp}:${accountId}`) with its private key.
   - The API verifies this signature against the registered device public key before returning the session blob.

---

## 4. Desktop Client Architecture (`apps/desktop`)

The desktop application is built with Tauri v2, Rust, and React 19, following a modular architecture:

```text
apps/desktop/
├── src/
│   ├── components/
│   │   ├── layout/       # Header, SubNavbar, Brand Crest, Window Drag Region
│   │   ├── accounts/     # AccountCard (Hextech design), AccountListTable (dense), EmptyState
│   │   ├── auth/         # LoginView (Team Vault sign-in, Remember Me)
│   │   └── modals/       # AddAccountModal, SyncAccountModal, DeleteConfirmModal, SettingsModal
│   ├── hooks/
│   │   ├── useAuth.ts          # Persistent auth, JWT storage, automatic session restore
│   │   ├── useLocalAccounts.ts # Standalone local vault CRUD and sandbox polling
│   │   └── useCloudAccounts.ts # Cloud team accounts, lease acquisition, session sync
│   ├── lib/
│   │   ├── api.ts        # Typed API client, token handling, Tauri invoke wrapper
│   │   ├── constants.ts  # Supported regions (EUW, NA, KR, etc.), storage keys
│   │   └── types.ts      # Domain interfaces and component contracts
│   ├── styles/
│   │   └── index.css     # Bespoke Hextech Tactical design system stylesheet
│   └── App.tsx           # High-level state coordinator (< 400 lines)
└── src-tauri/
    ├── src/
    │   ├── commands.rs   # Tauri IPC command entrypoints
    │   ├── session.rs    # Session token capture, injection, and backup logic
    │   ├── local_store.rs# Local encrypted SQLite profile store
    │   └── lib.rs        # Tauri application initialization and capability registration
    └── Cargo.toml        # Rust dependencies (keyring, ed25519-dalek, rusqlite, serde)
```

---

## 5. Security Invariants

| Invariant | Enforcement Mechanism |
| :--- | :--- |
| **No Password Storage** | Architecture completely lacks password fields; only encrypted session blobs are handled. |
| **Private Key Security** | Ed25519 private keys are stored in the macOS Keychain / Windows Credential Vault; only public keys cross the network. |
| **Lease Exclusivity** | PostgreSQL row-locking + partial unique index prevents concurrent duplicate leases. |
| **Role-Based Access Control** | Operators only see assigned accounts and their own devices. Account creation, session syncing, and deletion require `admin` role. |
| **Client Cleanliness** | Automatic backup and rollback ensures personal player settings are never permanently overwritten. |
| **No Process Hooking** | Zero DLL injection, zero memory scanning, and zero reading of Riot lockfiles. |
