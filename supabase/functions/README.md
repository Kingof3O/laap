# Edge Function boundary

`get-launch-payload` belongs here. It should authenticate the caller, verify the signed Ed25519 device challenge against `user_devices.public_key`, confirm the session owner and freshness, then fetch the secret from Supabase Vault and return only a short-lived encrypted payload to the Tauri client.

`upsert-account-credential` is the administrator-only write path. It accepts the credential once over TLS, stores a JSON envelope through the private `upsert_account_vault_secret` RPC, and returns only `{ success: true }`. The service-role key and decrypted Vault view never enter the dashboard bundle.

Never move credentials into `localStorage`, a database row, logs, query strings, or React state. The desktop Rust layer owns decryption, process launch, and memory zeroization.
