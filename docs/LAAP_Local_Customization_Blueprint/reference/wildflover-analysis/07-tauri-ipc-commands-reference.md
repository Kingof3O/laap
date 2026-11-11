# 07 - Tauri IPC Commands Reference

## Overview

The following reference table documents all **Tauri IPC Command Handlers** discovered inside `wildflover.exe`. These handlers represent the boundary between the web frontend and the native Rust backend.

---

## 1. System, State & Lifecycle

| Command Name | Description |
| :--- | :--- |
| `save_persistent_state` | Saves app configuration and user settings to disk. |
| `set_minimize_to_tray` | Toggles whether minimizing hides the window to the Windows notification tray. |
| `set_auto_launch` | Configures Windows registry Run key for startup on boot. |
| `get_file_info` | Retrieves file metadata (size, timestamps, attributes). |
| `write_error_report` | Writes crash dumps or diagnostic logs to disk. |
| `open_folder_in_explorer` | Launches Windows File Explorer at a specific directory. |
| `set_install_directory` | Sets or moves the Wildflover application directory. |
| `clear_install_directory` | Wipes temporary install artifacts. |
| `set_developer_mode` | Unlocks advanced debugging and developer menus. |
| `show` | Restores and brings the main application window to the foreground. |

---

## 2. Patcher & Skin Staging Pipeline

| Command Name | Description |
| :--- | :--- |
| `download_skin` | Downloads official skin assets or unpacks them from local WADs. |
| `download_tft_skin` | Handles Teamfight Tactics arenas, Little Legends, and booms. |
| `activate_mods` | Stages, normalizes, and commands the patcher to mount selected mods. |
| `cancel_activation` | Aborts pending skin staging or unmounts the active overlay. |
| `set_game_path` | Persists the detected League of Legends installation directory. |
| `run_skin_fixers` | Invokes `fix_custom_fantome.py` or `ltk_base_skin.py` via Python runtime. |
| `scan_custom_mod` | Analyzes a community `.fantome` file for patch compatibility. |
| `apply_fixed_fantome` | Saves the repaired `.fantome` package to the active library. |
| `is_selection_fresh` | Checks if current skin selection has already been compiled into overlay. |
| `bridge_debug_log` | Appends diagnostic events to the bridge logging stream. |
| `bridge_send` | Sends raw IPC packets to `LeagueToolFlop.dll`. |

---

## 3. Cache & Storage Management

| Command Name | Description |
| :--- | :--- |
| `delete_cache_file` | Removes a specific cached asset from disk. |
| `delete_custom_mod_cache` | Wipes temporary extracted files from community mods. |
| `invalidate_fixed_mod_cache` | Forces re-evaluation of fixed custom skins after game updates. |
| `delete_marketplace_mod_cache`| Clears downloaded shop mods. |
| `delete_custom_mod_storage` | Uninstalls a custom skin package from local library. |
| `save_thumbnail_to_disk` | Caches skin splash art thumbnails to local storage. |
| `get_thumbnail_from_disk` | Reads cached thumbnail for UI display. |
| `delete_thumbnail_from_disk`| Purges obsolete thumbnail files. |
| `test_thumbnail_disk_storage` | Validates disk write access for the cache directory. |

---

## 4. Peer-to-Peer (P2P) Chunk Sync

| Command Name | Description |
| :--- | :--- |
| `read_file_chunk` | Reads a binary slice of a staged mod for peer transfer. |
| `save_p2p_chunk` | Writes an incoming mod chunk received from a party member. |
| `finalize_p2p_transfer` | Verifies chunk integrity and packages the complete mod. |
| `cleanup_p2p_transfer` | Discards stale or interrupted transfer buffers. |

---

## 5. Cloud Marketplace & R2 Catalog

| Command Name | Description |
| :--- | :--- |
| `r2_fetch_catalog` | Fetches the paginated community mod shop catalog. |
| `r2_get_download_url` | Requests a pre-signed Cloudflare R2 download URL. |
| `r2_download_mod` | Downloads a selected mod archive from R2. |
| `r2_like_mod` | Casts an upvote/like for a community skin. |
| `r2_increment_download` | Increments download counter for catalog metrics. |
| `r2_get_preview_url` | Fetches URL for skin video/image preview. |
| `r2_fetch_preview` | Downloads preview asset buffer for inline UI player. |
| `check_marketplace_mod_exists`| Verifies if a shop mod is already downloaded locally. |

---

## 6. SkinLab Developer & Archive Tools

| Command Name | Description |
| :--- | :--- |
| `skinlab_skins` | Enumerates champion skins and metadata. |
| `skinlab_read` | Reads raw internal data structures from a loaded mod. |
| `skinlab_mod_open` | Opens a mod for low-level inspection. |
| `skinlab_mod_close` | Releases file locks and closes the active mod. |
| `skinlab_locales` | Reads localization dictionaries. |
| `skinlab_wad_sizes` | Inspects WAD archive compression statistics. |
| `skinlab_mod_rows` | Lists entries inside an active mod archive. |
| `skinlab_has` | Checks presence of a specific file inside an archive. |
| `read_fantome_meta` | Parses `META/info.json` from `.fantome` container. |
| `write_fantome_meta` | Updates metadata inside `.fantome` container. |
| `list_fantome_contents` | Lists all files embedded inside `.fantome` zip archive. |
| `analyze_wad` | Runs heuristic analysis on a `.wad.client` file. |
| `wad_to_fantome` | Converts game WAD assets to a `.fantome` package. |
| `extract_fantome` | Unpacks a `.fantome` package into directory structure. |
| `export_mod_as_fantome` | Exports staged files as an installable `.fantome`. |
| `export_custom_mod_as_fantome`| Exports user-customized mod assets. |
| `bin_to_py` | Decompiles League `.bin` to Python syntax via `ritobin`. |
| `py_to_bin` | Compiles Python property text back to binary `.bin`. |
| `wad_unpack` | Unpacks `.wad.client` archive. |
| `wad_pack` | Repacks directory into `.wad.client` format. |

---

## 7. Client UI Themes (Pengu Loader)

| Command Name | Description |
| :--- | :--- |
| `client_themes_save_asset` | Saves custom background images or video files. |
| `client_themes_save_asset_path`| Registers file path for theme asset. |
| `client_themes_pick_media` | Opens file picker for video/image background. |
| `client_themes_clear_asset` | Restores default client visual assets. |
| `client_themes_set_music_options`| Sets custom lobby / client soundtrack. |
| `client_themes_pick_font` | Opens file picker for custom client fonts. |
| `client_themes_set_font_preset`| Applies predefined font preset to client CSS. |
| `client_themes_clear_font` | Restores default client font. |
| `client_themes_set_transition` | Configures UI transition animations. |

---

## 8. LCU Automation & In-Game Overlay

| Command Name | Description |
| :--- | :--- |
| `lcu_test_connection` | Tests REST/WebSocket connection to `LeagueClientUx.exe`. |
| `lcu_request` | Sends authenticated REST request to LCU endpoint. |
| `lcu_get_gameflow_phase` | Polls current match state (ChampSelect, InProgress, etc.). |
| `lcu_set_game_path` | Registers detected client path with the LCU connector. |
| `lcu_automation_set_config` | Sets auto-accept, auto-pick, or auto-apply rules. |
| `team_overlay_push` | Pushes match or player data to in-game overlay HUD. |
| `team_overlay_set_hotkey` | Registers keyboard hotkey to toggle in-game overlay. |
| `match_notice_show` | Displays match alert popup. |
| `match_notice_ready` | Acknowledges match readiness state. |
| `match_notice_action` | Dispatches user action from notification popup. |

---

## 9. Discord & Social

| Command Name | Description |
| :--- | :--- |
| `open_discord_oauth_window` | Launches Discord OAuth login window. |
| `discord_exchange_code` | Exchanges OAuth code for tokens. |
| `discord_refresh_token` | Refreshes expired Discord OAuth token. |
| `discord_revoke_token` | Revokes active Discord authorization. |
| `set_rpc_enabled` | Toggles Discord Rich Presence broadcasting. |
| `update_activity` | Updates current champion / game status on Discord profile. |
| `rpc_set_presence` | Sets party size and lobby status for Discord join requests. |

---

## 10. AI Chat, Voice & Third-Party APIs

| Command Name | Description |
| :--- | :--- |
| `ai_chat` | Sends prompts to Pollinations / OpenAI bridge. |
| `elevenlabs_tts` | Synthesizes speech using ElevenLabs API. |
| `streamelements_tts` | Synthesizes speech using StreamElements API. |
| `opgg_get_summoner_profile` | Queries OP.GG MCP endpoint for summoner builds and runes. |
| `register_hotkey` | Registers global hotkey hooks via `tauri-apps/global-hotkey`. |
| `set_performance_mode` | Throttles background processing when game is in fullscreen. |
| `set_app_low_priority` | Lowers process priority to avoid CPU contention during matches. |
