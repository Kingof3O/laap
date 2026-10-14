# REST API reference

Checked against v0.4.3 routes and schemas on 2026-10-14. This API manages Team Edition data; Personal Roster, avatars, and local rank sync use native Tauri commands, not these endpoints.

Local base URL: `http://127.0.0.1:4170`. The repository's Pages proxy targets `https://laap-api.hussiensalah100.workers.dev`. Configured endpoints are not a live-health assertion.

## Common rules

Requests with JSON bodies need `Content-Type: application/json`. IDs validated by `routeUuid` are UUIDs. Authentication is an HttpOnly browser cookie or `Authorization: Bearer <token>`. Errors include a machine-readable code and may include a message. See `apps/api/src/routes/` and `packages/validation/src/index.ts` for authoritative validation.

## Authentication

| Method and path | Behavior |
|:---|:---|
| `POST /api/auth/login` | `{email, password, remember?}` → `{user}`; trusted Tauri requests also receive `accessToken` |
| `GET /api/auth/session` | `{user}` or `{user: null}` for an absent/inactive session |
| `POST /api/auth/logout` | Clears browser cookie; `{success: true}` |
| `POST /api/auth/demo` | Development-only when enabled; disabled in production |

Remembered sessions last seven days; others last 15 minutes. Browser production cookies are HttpOnly, Secure, and SameSite=Lax. Logout does not revoke copies of an already-issued JWT server-side.

## Shared accounts

| Method and path | Access / result |
|:---|:---|
| `GET /api/accounts` | Authenticated; assigned accounts for operators, all for admins; `{accounts}` |
| `POST /api/accounts` | Admin; `{displayName, externalId, region, status?}` → `201 {accountId}` |
| `PATCH /api/accounts/:id` | Admin; nonempty subset of create fields → `{success: true}` |
| `DELETE /api/accounts/:id` | Admin; delete profile/session material → `{success: true}` |
| `PUT` or `POST /api/accounts/:id/session-blob` | Admin; `{sessionBlob}` → `{success: true}` |
| `DELETE /api/accounts/:id/session-blob` | Admin; revoke saved material → `{success: true}` |
| `POST /api/accounts/:id/release` | Admin; force release → `{success: true}` |

Create validation: display name 3–80 characters, external ID 3–120, region 2–16; status is `available`, `maintenance`, or `disabled`. Session blobs must be 10–131072 characters.

List records use the `DashboardAccount` contract, including `name`, `region`, `status`, `lastUsed`, `level`, `accent`, and optional `hasSessionBlob`/active-lease fields. Display statuses are `Available`, `Leased`, `Maintenance`, or `Disabled`; they differ from persisted create/update statuses.

Retired password endpoints (`POST .../credentials`, `GET .../credential-status`) return `410 RIOT_CREDENTIALS_DISABLED`.

## Leases

| Method and path | Input / result |
|:---|:---|
| `POST /api/leases/acquire` | `{accountId, deviceId?, nonce?, signature?}` → `{success, sessionId, isReconnect}` |
| `GET /api/leases/:sessionId/session-blob` | Authorized lease owner → `{sessionBlob}` |
| `POST /api/leases/:sessionId/heartbeat` | `{runtimeState?}`; refreshes lease/runtime state |
| `POST /api/leases/:sessionId/release` | Owner/admin; `{reason?}` defaults to `manual` |

Acquisition checks account availability, authorized device, and active assignment (admins bypass assignment). Signed requests with a device ID undergo Ed25519 challenge verification; nonce/signature fields are currently optional, so do not describe signatures as mandatory. A supplied challenge is `timestamp:accountId`, accepted within a five-minute timestamp window; signatures are 64-byte Base64 without padding.

Conflicts include `ACCOUNT_BUSY` or `ACCOUNT_UNAVAILABLE` (409). Invalid signed challenges return `INVALID_DEVICE_SIGNATURE` (401); authorization failures such as `DEVICE_NOT_AUTHORIZED` or `NO_ACTIVE_ASSIGNMENT` return 403.

Runtime values are `LAUNCHING`, `IN_CLIENT`, `IN_GAME`, `RECONNECTING`, and `EXITED` (default `IN_CLIENT`). Desktop heartbeats run every 20 seconds; stale cleanup uses 120 seconds subject to reconnect grace. Release reasons are `manual`, `logout`, `lease_timeout`, `admin_force_release`, or `error`.

## Devices

| Method and path | Access / result |
|:---|:---|
| `GET /api/devices` | Own devices, or all for admins; `{devices}` |
| `POST /api/devices` | `{publicKey, platform, deviceName, appVersion}` → `201 {deviceId}` |
| `POST /api/devices/:id/heartbeat` | Owner; `{appVersion?}` → `{success: true}` |
| `POST /api/devices/:id/approve` | Admin → `{success: true}` |
| `DELETE /api/devices/:id` | Admin; revoke → `{success: true}` |

Platforms are `windows` or `macos`. Public keys are 32-byte Ed25519 Base64 without padding (43 characters).

## Administration and dashboard

| Method and path | Access / result |
|:---|:---|
| `GET /api/dashboard` | Authenticated, scoped; `{user, metrics, sessions, activity, accounts}` |
| `GET /api/metrics` | Authenticated, scoped; metrics object |
| `GET /api/sessions` | Authenticated, scoped; `{sessions}` |
| `GET /api/activity` | Authenticated, scoped; `{activity}` |
| `GET /api/users` | Admin; `{users}` |
| `POST /api/users` | Admin; `{email, displayName, password, role?}` → `201 {user}` |
| `PATCH /api/users/:id` | Admin; nonempty subset of `{displayName, role, status}` → `{user}` |
| `POST /api/users/:id/reset-password` | Admin; `{password}` → `{success: true}` |
| `GET /api/assignments` | Admin; `{assignments}` |
| `POST /api/assignments` | Admin; `{accountId, userId, expiresAt?}` → `201 {assignmentId}` |
| `DELETE /api/assignments/:accountId/:userId` | Admin → `{success: true}` |
| `GET /api/audit?limit=100&offset=0` | Admin; `{audit, pagination: {limit, offset, hasMore}}` |

New/reset user passwords need at least 12 characters. Roles are `admin`/`operator`; statuses are `active`/`suspended`/`disabled`. Assignment expiry must be a future ISO datetime or null. Audit rows are operational logs; cryptographic tamper evidence is not implemented.

## Liveness

`GET /api/health` returns `{status: "ok", service: "laap-api", environment, timestamp}`. `GET /api/ready` returns `{status: "ready", service: "laap-api", timestamp}`. These handlers return application liveness data; they do not issue a database connectivity probe.
