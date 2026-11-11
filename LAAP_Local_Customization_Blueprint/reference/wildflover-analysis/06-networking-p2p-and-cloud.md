# 06 - Networking, P2P Sync & Cloud Services

## Overview

Wildflover utilizes a hybrid networking model combining cloud services (Cloudflare Workers + R2), decentralized Peer-to-Peer file transfers (for lobby skin sync), external gaming APIs (OP.GG, Discord), and cloud AI speech providers.

---

## 1. Cloud Infrastructure (Cloudflare Workers & R2)

The application relies on Cloudflare's serverless ecosystem for user accounts, catalog discovery, and file distribution:

* **API Endpoints:**
  * `https://api.wildflover.wf`
  * `https://wildflover-api.serdarsafayilmaz123.workers.dev`
  * `https://api.wildflover.wf/api/components/engine`
  * `https://api.wildflover.wf/api/releasesUpdate`
* **Cloudflare R2 Object Storage (Marketplace / Mod Catalog):**
  * Custom community skins and previews are hosted on Cloudflare R2 buckets.
  * **IPC Handlers:**
    * `r2_fetch_catalog`: Fetches paginated mod catalog listings.
    * `r2_get_download_url` / `r2_download_mod`: Retrieves signed URLs to stream mod archives.
    * `r2_like_mod`: Increments like counters for community creations.
    * `r2_increment_download`: Tracks download popularity metrics.
    * `r2_get_preview_url` / `r2_fetch_preview`: Streams high-resolution preview images and videos.

---

## 2. Peer-to-Peer (P2P) Party & Match Sync

A signature advertised feature of Wildflover is that **other party members can see your custom skins**, even though the skins are rendered client-side on each machine. 

To achieve this without routing massive amounts of bandwidth through central servers, Wildflover implements a direct **P2P chunk-streaming system**:

```
[Party Leader / Player A]                     [Party Member / Player B]
         │                                              │
         ├────── 1. Announces Selected Mod / Hash ─────>│ (via Discord / LCU Party)
         │                                              │
         ├────── 2. read_file_chunks(staged_mod) ──────>│
         │          (Streams 64KB/128KB chunks)         │
         │                                              │
         │<───── 3. save_p2p_chunk(chunk_data) ─────────┤
         │                                              │
         ├────── 4. finalize_p2p_transfer() ───────────>│ (Reconstructs .fantome)
         │                                              │
         ▼                                              ▼
   [Mounts into LTK]                              [Mounts into LTK]
```

### IPC Commands Powering P2P:
* `read_file_chunk`: Reads a sliced chunk of a prepared `.fantome` mod package on the sender client.
* `save_p2p_chunk`: Writes the received binary chunk to a temporary cache buffer on the receiving client.
* `finalize_p2p_transfer`: Verifies SHA/XXHash integrity, flushes the completed mod file to disk, and stages it for LTK injection.
* `cleanup_p2p_transfer`: Cleans up temporary staging buffers upon transfer completion or cancellation.

---

## 3. Discord Integration (OAuth & Rich Presence)

Wildflover integrates deeply with Discord for authentication and presence tracking:
* **Discord OAuth Flow:**
  * `open_discord_oauth_window`: Opens a dedicated OAuth2 window.
  * `discord_exchange_code`: Exchanges the authorization code for user access tokens.
  * `discord_refresh_token` & `discord_revoke_token`: Manages session lifecycle.
  * Callback URI: `http://localhost/tauri.localhost/auth/callback`.
* **Rich Presence (Discord RPC):**
  * Displays active game status, champion played, and party status (`partyId`, `partySize`, `partyMax`).
  * Enables lobby discovery for party sync.

---

## 4. OP.GG & Stats Integration

The app connects to **OP.GG** through an internal MCP (Model Context Protocol) API endpoint:
* **Endpoint:** `https://mcp-api.op.gg/mcp` (`Content-Type: application/json`).
* **Command:** `opgg_get_summoner_profile`.
* **Functionality:**
  * Pulls summoner win-rates, champion masteries, counter matchups, and recommended rune sets directly into the Wildflover overlay during champion select.

---

## 5. AI Commentary & Text-to-Speech (TTS)

Wildflover integrates multiple cloud voice synthesis and AI providers:
* **ElevenLabs:** `https://api.elevenlabs.io/v1/text-to-speech/` (for high-fidelity voice commentary).
* **StreamElements:** `https://api.streamelements.com/kappa/v2/speech` (for real-time in-game TTS alerts).
* **Pollinations / OpenAI Bridge:** `https://text.pollinations.ai/openai/chat/completions` and `https://g4f.space/api/pollinations/chat/completions` (for dynamic text and commentary generation via `ai_chat`).
