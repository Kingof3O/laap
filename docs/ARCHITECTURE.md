# LAAP architecture notes

## Boundaries

The workspace keeps presentation, domain contracts, and security-sensitive execution separate:

```text
apps/admin (React UI)
        │ typed DTOs only
        ▼
packages/types + packages/validation
        │ authenticated HTTP API / Edge Function boundary
        ▼
apps/api (auth + SQL.js local adapter + atomic lease service)
        │ production adapter
        ▼
supabase (RLS + atomic lease functions + Vault)
        ▲
        │ signed lease + native client state
apps/desktop (Tauri/Rust process monitor and native launcher)
```

The dashboard uses the API adapter in `apps/admin/src/lib/api.ts`. The local API is fully runnable without a cloud account and persists to SQL.js/WASM. The API also includes a Supabase service adapter selected with `LAAP_STORAGE_DRIVER=supabase`; it uses service-role queries for read models and the explicit `*_for_user` Postgres RPCs for lease mutations. The local adapter remains intentionally single-process for development.

## Security invariants

1. The browser never receives or stores Riot credentials, private device keys, or long-lived launch tokens.
2. Every lease claim is authorized by the server using the authenticated user, an active assignment, and an active device record.
3. PostgreSQL locks the account row and enforces one `starting`/`active`/`stopping` session per account with a partial unique index.
4. Tauri signs device challenges with an Ed25519 key held by the OS keychain and launches Riot Client without credentials.
5. Admin actions are role-gated by signed session claims in the local API (or immutable JWT `app_metadata` in Supabase) and recorded in `audit_logs`.
6. Password-based credential storage and injection are not part of the production architecture. Riot authentication stays inside Riot's supported client/RSO flow.

## Frontend conventions

- Components are presentational and receive typed props; page-level modules own composition and state.
- Semantic CSS variables are the source of truth for the dark-only theme. Avoid per-component raw hex values.
- Interactive controls use native buttons/inputs, Lucide SVG icons, descriptive labels, visible focus rings, and `aria-live` for transient feedback.
- Mobile styles are the default. The session table changes to labeled row groups rather than introducing a horizontal scroll region.
- `prefers-reduced-motion` disables non-essential transitions and spinners.

## Supported Riot authentication boundary

Riot's official RSO flow is available only to approved production applications. When an RSO client is approved, account linking should be implemented as a browser OAuth authorization-code flow with server-side token exchange and encrypted refresh-token storage. RSO tokens identify/authorize the player for supported Riot APIs; they are not a supported way to silently sign the native League client in.

The Tauri app therefore launches Riot Client with no arguments or secrets, waits for the user to complete Riot's normal authentication, and reports process/lease states. No credential injector, memory scraper, cookie extractor, or command-line password path is permitted.
