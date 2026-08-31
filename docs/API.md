# LAAP local API

The local API mirrors the production RPC/Edge Function boundary so the UI can be developed without a cloud project.

Set `LAAP_STORAGE_DRIVER=supabase` to use the Supabase service adapter. It requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; the service-role key stays server-side.

## Authentication

- `POST /api/auth/login` accepts `{ email, password }` and sets an `HttpOnly`, `Secure`, `SameSite=None` `__Host-laap_access` cookie in production (the local adapter uses `laap_access`).
- `GET /api/auth/session` returns the current sanitized user.
- `POST /api/auth/demo` exists only when `NODE_ENV !== production` and `ENABLE_DEMO_AUTH` is not `false`.
- The browser never receives a password hash, vault key, private key, Riot password, or native-client token.

## Operations

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/api/dashboard` | authenticated |
| `GET` | `/api/accounts` | authenticated; operators see assigned accounts |
| `POST` | `/api/accounts` | admin |
| `GET` | `/api/users` | admin |
| `POST` | `/api/users` | admin; creates an Auth user and profile |
| `GET` | `/api/assignments` | admin |
| `POST` | `/api/assignments` | admin |
| `DELETE` | `/api/assignments/:accountId/:userId` | admin |
| `GET` | `/api/devices` | authenticated; operators see their devices |
| `POST` | `/api/devices` | authenticated, own device |
| `POST` | `/api/leases/acquire` | authenticated + active assignment/device |
| `POST` | `/api/leases/:id/heartbeat` | session owner |
| `POST` | `/api/leases/:id/release` | owner or admin |
| `GET` | `/api/audit` | admin |

Lease acquisition runs under a serialized transaction and is protected by a unique active-session index. A signed `{ nonce, signature }` device challenge is mandatory in production; development fixtures may omit it to keep the local demo usable.
