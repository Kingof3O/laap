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
│               - Domain Interfaces: IAuth, IAccount, ILease, IDevice, IAdmin           │
│               - SQL.js / SQLite Modular Domain Services                               │
│               - Supabase PostgreSQL & RLS Modular Domain Services                     │
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

## 2. Managed Riot Session Material (Deferred Boundary)

The account session capture/injection path is intentionally still present for
the current product milestone, but it is a deferred integration boundary—not an
official Riot authentication API and not a guarantee of compatibility or
anti-cheat safety. LAAP must never collect Riot passwords, and this path should
only be enabled for accounts and environments where the operator has explicit
authorization. Replacing it with a supported Riot flow remains separate work.

### The Problem with Password Injection
Traditional account management tools store plaintext or weakly encrypted Riot account passwords and attempt to inject them using keystroke simulation or memory scraping. This approach introduces major security vulnerabilities, triggers anti-cheat flags, fails on multi-factor authentication, and exposes player accounts to credential theft.

### Current LAAP Session Flow
LAAP operates exclusively at the **authenticated session layer**:

1. **How Riot Client Maintains Sessions:**
   When a user signs into Riot Client with *"Stay signed in"* enabled, Riot writes an authenticated session token into the client configuration file (`RiotClientPrivateSettings.yaml`).
2. **One-Time Capture (Sandbox Mode):**
   - **Local Capture:** The user clicks *"Capture Active Riot Login"* (which reads the current local Riot settings) or *"Open Riot Sign-In Sandbox"*.
   - In Sandbox mode, LAAP opens a fresh, isolated Riot Client process. The user enters their credentials once.
   - LAAP detects the newly generated session token, stores it in the local standalone roster (or uploads it to Shared Accounts if performed by an admin), and closes the sandbox.
3. **1-Click Launch (Session Injection):**
   - When launching an account, LAAP backs up the user's personal `RiotClientPrivateSettings.yaml`.
   - It injects the account's authenticated session YAML.
   - It boots the Riot Client / League of Legends launcher. The client boots directly into the game without prompting for a password.
4. **Automatic Rollback & Cleanup:**
   - When the user releases the account or clicks *"Restore Personal Riot Client Settings"*, LAAP cleans up the injected credentials and restores the player's personal profile.

---

## 3. Atomic Lease Brokering & Concurrency Control

In **Shared Accounts (Cloud Mode)**, account access is strictly regulated:

1. **Atomic Lease Acquisition:**
   Lease acquisitions execute inside a serialized transaction (`acquireLease`).
   - Verifies user role or active operator assignment.
   - Confirms the account is currently `available`.
   - Creates an active lease row with a duration timestamp.
   - Atomically transitions the account status to `leased`.
2. **Partial Unique Indexing:**
   A partial unique index (`WHERE status IN ('starting', 'active', 'stopping')`) guarantees that **no account can ever have more than one active lease concurrently**.
3. **Cryptographic Device Challenge-Response:**
   - Every desktop client creates an Ed25519 keypair stored in the native OS keychain.
   - When acquiring a lease, the client signs a server nonce (`${timestamp}:${accountId}`) with its private key.
   - The API verifies this signature against the registered device public key before returning the encrypted-at-rest session blob.

4. **Lease liveness and recovery:** The desktop reports `LAUNCHING`, `IN_CLIENT`,
   `IN_GAME`, `RECONNECTING`, or `EXITED` every 20 seconds. The API ends an
   `EXITED` session immediately and reaps missing heartbeats after 120 seconds;
   a startup recovery command restores any settings backup left by a crashed
   desktop process when Riot is not running.

The desktop deliberately does **not** infer an authenticated Riot account from
the existence of a Riot process. Riot does not expose a documented, stable
native-client signal for the signed-in account. Until a supported integration is
approved, the UI reports *Waiting for Riot login* while the client is present
and *League running* when the game process is present; it never claims
`Authenticated` or `Account verified` from process presence alone.

---

## 4. Super Deep Modular Monorepo Architecture

### Desktop Client Architecture (`apps/desktop`)
The desktop frontend is organized using **Feature-Sliced Architecture (Vertical Slices)**:

```text
apps/desktop/
├── src/
│   ├── features/
│   │   ├── personal-roster/    # Standalone local accounts slice (CRUD, sandbox poller, modals)
│   │   ├── team-vault/         # Cloud Shared Accounts slice (lease claim, sync, held banner)
│   │   ├── device/             # Dedicated hardware identity & key registration hook (useDevice)
│   │   └── auth/               # Shared accounts login view, persistent JWT auth hook (useAuth)
│   ├── shared/
│   │   └── ui/                 # Reusable UI kit (Header, SubNavbar, Cards, Modals, Tables, UpdateModal)
│   ├── hooks/
│   │   └── useUpdateChecker.ts # In-app GitHub release poller and semver comparator
│   ├── context/
│   │   └── ToastContext.tsx    # Centralized floating HUD glassmorphism toasts
│   ├── lib/
│   │   ├── api.ts              # Typed fetch client and Tauri invoke bridge
│   │   ├── constants.ts        # Region enums & local storage keys
│   │   └── types.ts            # Frontend domain contracts
│   └── App.tsx                 # Lean coordinator shell (< 140 lines)
└── src-tauri/
    └── src/
        ├── riot/               # Decoupled Riot Client subsystem
        │   ├── paths.rs        # Platform settings directory resolution
        │   ├── process.rs      # Sysinfo process inspection and termination
        │   ├── session_manager.rs # YAML token backup, injection, and restore
        │   ├── provisioner.rs  # Isolated sandbox credential poller
        │   └── mod.rs          # Re-exports & unit tests
        ├── local_store/        # Decoupled standalone account store
        │   ├── models.rs       # LocalAccount and LocalAccountSummary DTOs
        │   ├── storage.rs      # OS filesystem storage paths and JSON serialization
        │   ├── manager.rs      # LocalStore CRUD operations & 1-click launcher
        │   └── mod.rs          # Re-exports & unit tests
        ├── commands/           # Modular Tauri IPC command handlers
        │   ├── device.rs       # device_public_key, device_platform, sign_device_nonce
        │   ├── local_accounts.rs # list_local_accounts, save_local_account, delete, launch
        │   ├── session.rs      # inject_account_session, launch_riot_client, sandbox commands
        │   └── mod.rs          # IPC command router & tests
        ├── device.rs           # Ed25519 identity generation & signing
        └── lib.rs              # Application bootstrap & handler registration
```

### Backend API Architecture (`apps/api`)
The backend is structured into **Segregated Domain Services**:

```text
apps/api/
├── src/
│   ├── routes/                 # Focused HTTP route handlers
│   │   ├── auth.routes.ts      # Session check, login, demo, logout
│   │   ├── accounts.routes.ts  # Account CRUD, session blob upload
│   │   ├── leases.routes.ts    # Lease acquire, session blob fetch, release
│   │   ├── devices.routes.ts   # Device registration, list, revocation
│   │   └── admin.routes.ts     # Dashboard snapshot, metrics, audit logs, users, assignments
│   ├── services/
│   │   ├── domain/             # ISP-compliant domain interfaces
│   │   │   ├── auth.ts         # IAuthService
│   │   │   ├── accounts.ts     # IAccountService
│   │   │   ├── leases.ts       # ILeaseService
│   │   │   ├── devices.ts      # IDeviceService
│   │   │   └── admin.ts        # IAdminService
│   │   ├── sqlite/             # SQLite domain implementations
│   │   ├── supabase/           # Supabase domain implementations
│   │   ├── laap-service.ts     # SQLite composite facade (75 lines)
│   │   └── supabase-service.ts # Supabase composite facade (80 lines)
│   ├── router.ts               # Master route dispatcher
│   └── server.ts               # Lean HTTP server coordinator
```

---

## 5. Security Invariants

| Invariant | Enforcement Mechanism |
| :--- | :--- |
| **No Riot password handling** | Riot passwords are not accepted by LAAP. The deferred session-blob path is encrypted at rest with an application vault key. |
| **Private Key Security** | Ed25519 private keys are stored in the macOS Keychain / Windows Credential Vault; only public keys cross the network. |
| **Lease Exclusivity** | Database row-locking + partial unique index prevents concurrent duplicate leases. |
| **Role-Based Access Control** | Operators only see assigned accounts and their own devices. Account creation, session syncing, and deletion require `admin` role. |
| **Client Cleanliness** | Automatic backup and rollback ensures personal player settings are never permanently overwritten. |
| **No Process Hooking** | Zero DLL injection, zero memory scanning, and zero reading of Riot lockfiles. |
