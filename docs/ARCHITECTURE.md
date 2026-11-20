# LAAP architecture

LAAP Basic and Pro are license tiers of one desktop app for local League of Legends and VALORANT accounts. The app uses the `com.laap.offline` installer identity and the `latest-offline.json` updater channel.

| Component | Responsibility |
| --- | --- |
| `apps/desktop/src` | React roster, profile editor, settings, presence, updates, and billing UI |
| `apps/desktop/src-tauri/src/local_store` | Local profile metadata, encrypted saved Riot sessions, and Basic slot enforcement |
| `apps/desktop/src-tauri/src/riot` | Official Riot Client launch, session capture and restore, and game process guards |
| `apps/desktop/src-tauri/src/billing.rs` | Device-bound Pro leases and desktop billing requests |
| `apps/api/src/billing-worker.ts` | Checkout, email verification, Pro leases, gift codes, transfers, and owner tools |
| `apps/api/src/riot-worker.ts` | League live-match lookup through the Riot API |
| `billing/supabase.sql` | Billing data and transaction functions |

The webview sends typed commands to Tauri. Native Rust owns Riot session access, provider requests, and update verification. Profile records and Riot session material stay on the machine. The Workers support optional live-match lookups and paid licensing.

See the [security and storage model](SECURITY_MODEL.md) and [production operations](PRODUCTION.md).
