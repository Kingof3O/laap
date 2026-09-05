# LAAP REST API Specification

The LAAP Core API exposes an authenticated REST API for managing accounts, hardware devices, assignments, and atomic session leases.

- **Base URL (Local Development):** `http://127.0.0.1:4170`
- **Base URL (Cloud Production):** `https://laap-api.hussiensalah100.workers.dev`

---

## 1. Authentication & Session Management

### `POST /api/auth/login`
Authenticates a user with email and password.
- **Request Body:**
  ```json
  {
    "email": "admin@laap.local",
    "password": "••••••••••••",
    "remember": true
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": "usr_01J...",
      "email": "admin@laap.local",
      "displayName": "Admin",
      "role": "admin",
      "status": "active"
    }
  }
  ```
- The bearer token is returned only to trusted Tauri origins (`tauri://localhost`, `https://tauri.localhost`, `http://tauri.localhost`, or local desktop development). Browser clients receive an `HttpOnly`, `Secure`, `SameSite=Lax` cookie (`__Host-laap_access`) instead. `remember: true` uses a seven-day session; otherwise the session is fifteen minutes.
- Trusted Tauri responses include the same `user` object plus an `accessToken` for native keychain storage.

### `GET /api/auth/session`
Returns the currently authenticated user profile.
- **Headers:** `Authorization: Bearer <token>` or valid session cookie.
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": "usr_01J...",
      "email": "admin@laap.local",
      "displayName": "Admin",
      "role": "admin",
      "status": "active"
    }
  }
  ```

### `POST /api/auth/logout`
Terminates the current session and clears cookies.
- **Response (200 OK):** `{ "success": true }`

---

## 2. Account Management

### `GET /api/accounts`
Lists accounts in the shared pool.
- Operators only see accounts assigned to them.
- Admins see all accounts.
- **Response (200 OK):**
  ```json
  {
    "accounts": [
      {
        "id": "acc_01J...",
        "name": "T1 Faker",
        "region": "KR",
        "status": "available",
        "hasSessionBlob": true,
        "lastUsed": "2026-09-02T18:30:00Z"
      }
    ]
  }
  ```

### `POST /api/accounts`
Registers a new account in the cloud pool.
- **Access:** Admin only.
- **Request Body:**
  ```json
  {
    "displayName": "T1 Faker",
    "externalId": "Faker#KR1",
    "region": "KR",
    "status": "available"
  }
  ```
- **Response (201 Created):** `{ "accountId": "acc_01J..." }`

### `DELETE /api/accounts/:id`
Permanently deletes an account and purges its stored session blob.
- **Access:** Admin only.
- **Response (200 OK):** `{ "success": true }`

### `PUT /api/accounts/:id/session-blob`
Uploads or updates the authenticated Riot session YAML for an account.
- **Access:** Admin only.
- **Request Body:**
  ```json
  {
    "sessionBlob": "data: yaml string with token payload..."
  }
  ```
- **Response (200 OK):** `{ "success": true }`

`POST /api/accounts/:id/credentials` and `GET /api/accounts/:id/credential-status`
are retired and return `410 RIOT_CREDENTIALS_DISABLED`; LAAP never accepts Riot
usernames or passwords.

---

## 3. Atomic Lease Brokering

### `POST /api/leases/acquire`
Acquires an exclusive atomic lease for an account.
- **Access:** Authenticated user with active assignment (or Admin bypass).
- **Request Body:**
  ```json
  {
    "accountId": "acc_01J...",
    "deviceId": "dev_01J...",
    "nonce": "1788239000000:acc_01J...",
    "signature": "base64-encoded-ed25519-signature"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "sessionId": "ses_01J...",
    "isReconnect": false,
    "success": true
  }
  ```
- **Errors:**
  - `409 Conflict` (`ACCOUNT_UNAVAILABLE`): Account is currently leased to another player.
  - `403 Forbidden` (`UNAUTHORIZED_DEVICE`): Invalid cryptographic signature or unregistered device.

### `GET /api/leases/:sessionId/session-blob`
Retrieves the decrypted session blob for injecting into the native client.
- **Access:** Session owner only.
- **Response (200 OK):**
  ```json
  {
    "sessionBlob": "login_remember_me_tokens:\n  ..."
  }
  ```

### `POST /api/leases/:sessionId/heartbeat`
Refreshes an active lease and records the desktop runtime state.
- **Request Body:** `{ "runtimeState": "LAUNCHING|IN_CLIENT|IN_GAME|RECONNECTING|EXITED" }`
- Heartbeats are sent by the desktop every 20 seconds. `EXITED` ends the lease immediately; missing heartbeats are reaped after 120 seconds (with reconnect grace where applicable).

### `POST /api/leases/:sessionId/release`
Releases an active lease and returns the account to `available` state.
- **Access:** Session owner or Admin.
- **Request Body:**
  ```json
  {
    "reason": "manual"
  }
  ```
- **Response (200 OK):** `{ "success": true }`

---

## 4. Hardware Device Registration

### `GET /api/devices`
Lists registered hardware devices for the authenticated user.
- **Response (200 OK):**
  ```json
  {
    "devices": [
      {
        "id": "dev_01J...",
        "deviceName": "Gaming PC",
        "platform": "macos",
        "publicKeyPresent": true,
        "lastSeenAt": "2026-09-03T02:00:00Z"
      }
    ]
  }
  ```

### `POST /api/devices`
Registers a new hardware device.
- **Request Body:**
  ```json
  {
    "deviceName": "Gaming PC",
    "platform": "macos",
    "publicKey": "base64-encoded-ed25519-public-key",
    "appVersion": "1.0.0"
  }
  ```
- **Response (201 Created):** `{ "deviceId": "dev_01J..." }`

### `POST /api/devices/:id/heartbeat`
Refreshes the last-seen timestamp for the authenticated user's active device.

### `POST /api/devices/:id/approve`
Approves a revoked device so it can register again.
- **Access:** Admin only.

---

## 5. Administration & Audit

### `GET /api/dashboard`
Returns aggregated business metrics for the Web Control Center.
- **Response (200 OK):**
  ```json
  {
    "totalAccounts": 12,
    "activeLeases": 3,
    "availableAccounts": 9,
    "verifiedDevices": 15
  }
  ```

### `GET /api/audit`
Retrieves tamper-evident audit logs of all lease and admin actions.
- **Access:** Admin only.
- **Response (200 OK):** `{ "audit": [...], "pagination": { "limit": 100, "offset": 0, "hasMore": false } }`

### `GET /api/health`
Health check endpoint returning system status and database connectivity.
- **Response (200 OK):** `{ "status": "ok", "timestamp": "2026-09-03T02:30:00Z" }`
