# Edge Function boundary

Riot authentication is deliberately not implemented as a server-side password handoff. The current core keeps the existing local session-material boundary deferred; it does not depend on RSO for the lease flow.

Password-based credential writes are intentionally not part of LAAP. If a future approved Riot integration is added, its OAuth material must stay server-side and be documented as a separate feature. Do not expose these legacy compatibility functions to authenticated clients.

Never move Riot passwords into `localStorage`, logs, query strings, or React state. The desktop Rust layer owns native process launch and monitoring; it does not receive Riot passwords. The deferred session-material path is separately encrypted at rest and should be replaced by a supported Riot integration.
