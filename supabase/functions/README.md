# Edge Function boundary

`get-launch-payload` belongs here. It should authenticate the caller, verify the signed Ed25519 device challenge against `user_devices.public_key`, confirm the session owner and freshness, then fetch the secret from Supabase Vault and return only a short-lived encrypted payload to the Tauri client.

Password-based credential writes are intentionally not part of LAAP. Riot accounts must be linked through an approved Riot Sign On (RSO) OAuth client; the service-role key and any OAuth refresh material stay server-side.

Never move credentials into `localStorage`, a database row, logs, query strings, or React state. The desktop Rust layer owns decryption, process launch, and memory zeroization.
