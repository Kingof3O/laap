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
        │ signed, short-lived launch payload
apps/desktop (Tauri/Rust process monitor and injector)
```

The dashboard uses the API adapter in `apps/admin/src/lib/api.ts`. The local API is fully runnable without a cloud account and persists to SQL.js/WASM. The API also includes a Supabase service adapter selected with `LAAP_STORAGE_DRIVER=supabase`; it uses service-role queries for read models and the explicit `*_for_user` Postgres RPCs for lease mutations. The local adapter remains intentionally single-process for development.

## Security invariants

1. The browser never receives or stores Riot credentials, private device keys, or long-lived launch tokens.
2. Every lease claim is authorized by the server using the authenticated user, an active assignment, and an active device record.
3. PostgreSQL locks the account row and enforces one `starting`/`active`/`stopping` session per account with a partial unique index.
4. Tauri signs device challenges with an Ed25519 key held by the OS keychain. Rust owns transient decryption and `zeroize` cleanup.
5. Admin actions are role-gated by signed session claims in the local API (or immutable JWT `app_metadata` in Supabase) and recorded in `audit_logs`.
6. Local credential writes use an AES-256-GCM encrypted vault file with restrictive permissions; cloud deployments should switch this adapter to Supabase Vault.

## Frontend conventions

- Components are presentational and receive typed props; page-level modules own composition and state.
- Semantic CSS variables are the source of truth for the dark-only theme. Avoid per-component raw hex values.
- Interactive controls use native buttons/inputs, Lucide SVG icons, descriptive labels, visible focus rings, and `aria-live` for transient feedback.
- Mobile styles are the default. The session table changes to labeled row groups rather than introducing a horizontal scroll region.
- `prefers-reduced-motion` disables non-essential transitions and spinners.

## Suggested next slices

1. Add a Supabase data adapter with generated database types and a single Realtime subscription per resource.
2. Add the production Edge Function that seals Vault credentials for the Tauri device's public encryption key.
3. Scaffold the Tauri shell and expose a minimal command DTO for device registration and process state.
4. Add CI for typecheck, SQL formatting, Rust tests, and a production build; keep secrets in deployment environment variables only.
