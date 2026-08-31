# Edge Function boundary

Riot authentication is deliberately not implemented as a server-side credential handoff. The only supported path is Riot Sign On (RSO) when Riot approves an RSO client for the application.

Password-based credential writes are intentionally not part of LAAP. Riot accounts must be linked through an approved Riot Sign On (RSO) OAuth client; the service-role key and any OAuth refresh material stay server-side.

Never move credentials into `localStorage`, logs, query strings, or React state. The desktop Rust layer owns native process launch and monitoring; it does not receive or decrypt Riot passwords.
