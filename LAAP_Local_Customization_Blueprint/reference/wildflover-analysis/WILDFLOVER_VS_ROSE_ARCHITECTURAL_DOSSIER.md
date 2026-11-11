# Comprehensive Technical Dossier: Wildflover vs. Rose
**Document Type:** Architectural Deep-Dive & Comparative Decision Dossier  
**Target Audience:** Autonomous AI Coding Agents, Software Architects, Security Engineers  
**Target Platform:** League of Legends (Windows 10/11 64-bit, Riot Vanguard Protected)  
**Parent Project Context:** LAAP (League Account Auto Provisioner / Desktop Launcher — Tauri 2 + Rust + React 19)

---

## 1. Executive Summary

This dossier provides an exhaustive, ground-truth technical comparison between two distinct architectural approaches to client-side League of Legends customization and skin management:

1. **Wildflover (v4.0.7):** A commercial, closed-source desktop suite built on **Tauri (Rust)** that drives an embedded **CPython 3.9** runtime, secretly hijacks **League Toolkit (LTK)** using an in-memory Win32 hook DLL (`LeagueToolFlop.dll`), dynamically normalizes and mutates official Riot assets to bypass LTK anti-skinhack checks (`ltk_base_skin.py`), and uses a custom **P2P chunk-transfer protocol** for party skin synchronization.
2. **Rose (`Alban1911/Rose`):** An open-source, modular utility built on a lightweight **Python daemon** and **Pengu Loader** that renders UI directly inside the League client Chromium frontend (Champ Select UI), integrates natively with LTK without adversarial memory hooks, and synchronizes skins across parties via a WebSocket relay.

---

## 2. In-Depth System Breakdown: Wildflover (v4.0.7)

### 2.1 Core Framework & Runtime Layout
* **Desktop Shell:** Tauri (Rust backend interfacing with Microsoft Edge WebView2). Binary size: `wildflover.exe` (~167 MB).
* **Installer:** NSIS-3 Unicode installer (`Wildflover-4.0.7-x64-setup.exe`, ~232 MB compressed, ~454 MB uncompressed, 2,185 files).
* **Embedded Runtime:** Ships a fully isolated CPython 3.9 environment (`runtime\python\`) with pre-compiled wheels: `xxhash`, `wheel`, `pyRitoFile`, `pycparser`, `cffi`.
* **State Management:** Tauri IPC handlers (`save_persistent_state`, `set_minimize_to_tray`, `set_auto_launch`, `set_developer_mode`).

### 2.2 Headless Patcher Hijack Subsystem (`LeagueToolFlop.dll`)
Wildflover does not write its own kernel or filesystem driver; it bundles the community **LTK Manager** (`ltk-manager-setup.exe`) and forces it into a headless background worker using a custom bridge DLL (`LeagueToolFlop.dll`, nicknamed *"BIG FLOP"* by author `lol123love`):
* **Win32 Window Suppression:** Hooks `ShowWindow`, `ShowWindowAsync`, `SetWindowPos`, `SetWindowPlacement`, `SetWindowLongW/A`, and `SetWindowLongPtrW/A` in LTK's process. Any attempt by LTK to create or display a window is forced to `SW_HIDE`, running LTK 100% invisibly.
* **WebView JavaScript Injection:** Injects JavaScript into LTK's Tauri WebView2:
  ```javascript
  (async () => {
    try {
      const r = await window.__TAURI_INTERNALS__.invoke(cmd, args);
    } catch(e) {}
  })();
  window.__ltk_health_spoofed = true;
  ```
  It hooks `window.__TAURI_INTERNALS__.invoke` to spoof LTK health checks and trigger internal patcher actions (`plugin:patcher|start_patcher`, `plugin:patcher|stop_patcher`, `plugin:patcher|get_patcher_status`).
* **Local HTTP/TCP Bridge:** Hosts an authenticated local micro-server (`LTK_API_PORT` / `CELESTIAL_API_PORT`, stored in registry `HKCU\Software\LTKBridge` with `ApiPort` and `ApiToken`).
  * Endpoints: `/import`, `/start_patcher`, `/stop_patcher`, `/patcher_status`.
  * Logs to `C:\Users\Public\ltk_bridge.log` and `C:\Users\Public\ltk_api.log`.

### 2.3 Asset Processing & Anti-Skinhack Bypass (`ltk_base_skin.py`)
LTK intentionally rejects official Riot skins loaded into `skin0` (default skin slot) with `"skin0 is another skin: ... names Skin<n>"` to prevent piracy. Wildflover circumvents this using a Python normalizer implementing two techniques:
1. **Identity Borrowing:** Reads the real base champion `.bin` from `<League>/Game/DATA/FINAL/Champions/<Champ>.wad.client`. Overwrites `championSkinName`, `tagEventList`, and `bankUnits` on `skin0` with neutral names (`_neutral_name`, stripping `Skin<n>`). The game audio still plays because League loads banks from `bankPath` (which remains untouched), while LTK's validator reads it as the unmodded default base skin.
2. **Mesh Repointing & Hash Mutation:**
   * Rewrites skeleton (`skl`) and simpleSkin (`skn`) file paths to end with a novel `_nmx` extension.
   * Appends 16 null bytes (`\x00` * 16) to the end of raw mesh binary streams. League's 3D engine reads mesh length from internal headers and ignores the trailing padding; however, LTK's cryptographic hash check fails to recognize the asset as a known official skin.

### 2.4 Modding Studio & Archive Engine (SkinLab & LtMAO)
* **LtMAO (`runtime\_vendor\LtMAO`):** Embeds community Python library `pyRitoFile` (`wad.py`, `bin.py`, `skn.py`, `dds.py`), `wad_tool.py`, `Ritoddstex.py`, and `hapiBin.py`.
* **Ritobin (`managers\ritobin_cli.exe`):** C++ CLI converting binary property trees (`.bin`) to Python text definitions and back.
* **CDTB Dictionary (`managers\hashes.game.txt`):** 203 MB hash dictionary mapping xxHash64 values back to original Riot asset file paths.
* **Legacy Mod Repair (`runtime\fix_custom_fantome.py`):** Standalone 400 KB script authored by `Zavith`. Re-bases legacy community custom skins across new patches, recalculating skeleton bone hierarchies and anchoring floating health bars (`--profile hpbar`).
* **SkinLab IPC:** Full in-app IDE for mods (`bin_to_py`, `py_to_bin`, `wad_unpack`, `wad_pack`, `wad_to_fantome`, `extract_fantome`, `skinlab_skins`, `skinlab_read`).

### 2.5 Client UI Themes & Pengu Loader Integration
* Automates download and local installation of **Pengu Loader v1.1.6** into the League client folder.
* **Theme Styling:** Tauri commands inject custom CSS, Google WebFonts (`client_themes_pick_font`), custom looping video/media backgrounds (`client_themes_pick_media`), and custom lobby/champ-select music tracks (`client_themes_set_music_options`).
* **UX Hot-Reload:** Calls internal Riot endpoint `POST https://127.0.0.1:<port>/riotclient/kill-and-restart-ux` to restart the client frontend instantly upon theme switch.

### 2.6 Networking, Cloud & Peer-to-Peer Subsystems
* **Cloud Infrastructure:** Cloudflare Workers (`wildflover-api.serdarsafayilmaz123.workers.dev` and `api.wildflover.wf`) + Cloudflare R2 object storage for the mod marketplace catalog (`r2_fetch_catalog`, `r2_download_mod`, `r2_like_mod`, `r2_increment_download`, `r2_get_preview_url`).
* **P2P Chunk Transfer (Party & Match Sync):**
  * Rather than uploading/downloading full skins through central servers, Wildflover streams custom mods directly between lobby members.
  * IPC commands: `read_file_chunk`, `save_p2p_chunk`, `finalize_p2p_transfer`, `cleanup_p2p_transfer`.
* **Third-Party APIs:**
  * **OP.GG:** Queries `https://mcp-api.op.gg/mcp` for summoner profiles, runes, and counter matchups (`opgg_get_summoner_profile`).
  * **Discord:** Discord OAuth2 token exchange and Rich Presence (`update_activity`, `rpc_set_presence`, party size broadcasting).
  * **AI Voice / TTS:** StreamElements TTS (`streamelements_tts`), ElevenLabs TTS (`elevenlabs_tts`), and Pollinations/OpenAI bridge (`ai_chat`) for in-game commentary.

---

## 3. In-Depth System Breakdown: Rose (`Alban1911/Rose`)

### 3.1 Core Framework & Runtime Layout
* **Architecture:** Python backend daemon + JavaScript/React UI extension running inside the League Client via **Pengu Loader**.
* **Source & Distribution:** 100% open-source under standard permissive/community license on GitHub (`Alban1911/Rose`).
* **Packaging:** Distributed as source (`python -m pip install -r requirements.txt`) or bundled executable installer (`Rose_Setup.exe`) via GitHub Releases.
* **Footprint:** Extremely lightweight compared to Wildflover (no heavy Tauri binary wrapper, no embedded 203 MB CDTB hash dictionaries, minimal disk usage).

### 3.2 In-Client UI & UX Philosophy
* Instead of requiring the user to switch between a desktop window and League, Rose embeds its interface **directly into the League Client's Chromium frontend**:
  * Injects a custom skin and chroma selection wheel directly inside the active Champion Select screen.
  * Allows selecting skins, chromas, randomized skins, and "historic" modes directly where the player is already interacting.
* Communication between the in-client JavaScript plugin and the background Python daemon is mediated over a local **WebSocket bridge** (`ws://127.0.0.1:<port>`).

### 3.3 LTK Patcher Integration
* Rose delegates the actual virtual filesystem mounting to **LTK Manager / LTK Patcher**.
* **Key Distinction from Wildflover:**
  * Rose interacts with LTK through standard, legitimate interfaces (CLI parameters or standard background daemon invocation).
  * It does **not** inject DLLs to hook Win32 `ShowWindow` APIs, does **not** suppress windows via API detours, and does **not** inject JavaScript into LTK's internal Tauri runtime.

### 3.4 Asset Delivery Pipeline
* **Remote Asset Repositories:** Rather than decompressing, extracting, and normalizing skins on-the-fly from the user's local WAD archives using heavy Python tooling, Rose historically pulls prepared, pre-structured skin packages from companion repositories (such as `Alban1911/LeagueSkins`).
* **Caching:** Downloads required champion packages on-demand and caches them locally in the user's application data directory.
* **Auto-Updater:** Includes a native self-updating mechanism to sync with new releases on GitHub.

### 3.5 Gameflow Tracking & Performance
* Connects directly to the League Client Update (LCU) REST API and WebSocket event bus.
* **LCU Optimization:** Implements aggressive in-memory TTL caching for LCU requests to eliminate redundant localhost HTTP polling during high-stress Champ Select phases.
* **Auto-Detection:** Listens for `ChampSelect` gameflow phase, reads the locked champion ID, verifies chosen skin/chroma configuration, and signals the patcher before the game switches to `InProgress`.

### 3.6 Party Mode
* Coordinates skin sharing among party members connected to a shared WebSocket relay.
* Instead of streaming raw binary file chunks peer-to-peer (like Wildflover's P2P), Rose broadcasts chosen skin and chroma identifiers. The receiving client looks up the identifier in its local cached library and mounts the identical skin.

---

## 4. Comprehensive Technical Comparison Matrix

| Feature / Architecture Dimension | Wildflover (v4.0.7) | Rose (`Alban1911/Rose`) |
| :--- | :--- | :--- |
| **Source Model** | Closed-source commercial (lifetime paid license). | **100% Open-Source** (GitHub). |
| **Primary Tech Stack** | **Tauri 2 (Rust) + CPython 3.9 + WebView2** | **Python + Pengu Loader (JS/React)** |
| **UI Placement** | Dedicated standalone desktop dashboard window. | **In-Client Overlay** (inside League Client Champ Select). |
| **LTK Interaction** | **Adversarial Hijack:** Injects `LeagueToolFlop.dll` to patch `ShowWindow` and hook Tauri WebView IPC. | **Standard Integration:** Native daemon / CLI coordination. |
| **Anti-Skinhack Bypass** | **Dynamic Normalizer (`ltk_base_skin.py`):** Identity Borrowing + Mesh Repointing (`_nmx` + 16 null bytes). | **Pre-processed Packages:** Relies on pre-built assets / companion repos. |
| **Asset Extraction Engine** | **Local & Self-Sufficient:** Bundles LtMAO, `pyRitoFile`, `ritobin`, and 203 MB CDTB hash dictionary. | **Remote / CDN-Dependent:** Downloads pre-made packages from GitHub (`LeagueSkins`). |
| **Party / Lobby Sync** | **P2P Binary Chunk Streaming:** Streams arbitrary custom files directly peer-to-peer. | **WebSocket Relay:** Broadcasts skin/chroma IDs; requires both users have asset installed. |
| **Client UI Theming** | Deep Pengu Loader integration (custom fonts, audio, video backgrounds, CSS). | Focuses primarily on the skin picker plugin within Pengu Loader. |
| **Modding Suite (IDE)** | Full built-in studio (**SkinLab**, `ritobin_cli`, `fix_custom_fantome.py`). | None (consumer playback tool only). |
| **Third-Party APIs** | OP.GG stats, Discord OAuth/RPC, ElevenLabs & StreamElements TTS, Pollinations AI. | Discord Presence, GitHub Releases API. |
| **Maintenance Burden** | High (bundled Python environment, large disk footprint, custom DLL maintenance). | Low to Medium (lightweight codebase, community-maintained plugins). |
| **Vanguard Attack Surface** | **HIGH RISK:** Win32 API import patching, DLL injection into sibling processes, runtime asset tampering. | **LOW TO MODERATE RISK:** Operates via standard LCU APIs and virtual overlay filesystem. |

---

## 5. What Rose Lacks vs. Wildflover (The Gap Analysis)

If you strictly mirror **Rose**, you will miss:
1. **Offline & Self-Contained Asset Generation:** Rose depends on companion repositories (`Alban1911/LeagueSkins`). If Riot issues DMCA takedowns against these repositories (which happens regularly to League skin archives), Rose breaks. Wildflover is completely immune to this because it extracts and normalizes skins locally from the user's installed League WAD files.
2. **True Peer-to-Peer Custom Skin Sharing:** Rose cannot share unique, custom-made community skins on-the-fly; it only syncs known skin IDs. Wildflover's P2P chunk protocol streams any custom skin package directly between clients.
3. **Standalone Desktop Management Studio:** Rose has no standalone window, no mod unpacking/packing tools (`SkinLab`), no `.bin` property sheet decompiler, and no automated health bar / skeleton repair script (`fix_custom_fantome.py`).
4. **Rich Client Audio/Video Themes:** Wildflover's dedicated theme customization engine (custom lobby soundtrack, video splash screens, custom fonts).

---

## 6. What Wildflover Lacks vs. Rose

If you strictly mirror **Wildflover**, you inherit its severe drawbacks:
1. **Adversarial & Fragile Architecture:** Wildflover relies on `LeagueToolFlop.dll` to patch Win32 APIs and suppress LTK. This technique resembles malware/adware behavior, is easily broken by Windows or LTK updates, and creates needless vulnerability to anti-cheat heuristics.
2. **Heavyweight Footprint:** Wildflover bundles a 167 MB Tauri executable, an embedded Python runtime, and a 203 MB text hash dictionary, resulting in an install size nearing 500 MB. Rose is lightweight and installs in seconds.
3. **Friction in User Experience:** In Wildflover, the user must manage an external desktop window while in Champ Select. In Rose, the skin selector appears seamlessly directly inside the League client interface.
4. **Proprietary / Hostile Stance:** Wildflover actively hijacks other open-source community software (LTK, LtMAO, Pengu) without giving back to the ecosystem.

---

## 7. The Riot Vanguard & Anti-Cheat Reality (Critical for LAAP)

### 7.1 Riot Games' Policy Distinction
* **Custom Community Mods (Tolerated):** Riot generally tolerates custom skins made by fans (e.g., custom anime models, custom sound effects) provided they do not give a competitive advantage.
* **Official Skin Piracy / "Skinhacks" (Enforced Bans):** Unlocking Riot’s official paid cosmetics for free is considered revenue circumvention and is actively targeted by Riot Vanguard.

### 7.2 Detection Vectors & Hazards
1. **Import/Export Memory Hooking:** Wildflover’s use of `LeagueToolFlop.dll` to patch Win32 APIs (`ShowWindow`, `SetWindowLong`) is a classic heuristic trigger for Vanguard's memory integrity scanners.
2. **Overlays vs. Memory Injection:** Both tools now avoid direct memory injection into `League of Legends.exe` (CS-LoL’s old `cslol-dll.dll` injection is dead). Both rely on LTK’s filesystem overlay mount. However, Wildflover's normalizer (`ltk_base_skin.py`) deliberately alters asset headers to fool mod loaders—a technique that can be trivially flagged if Vanguard inspects mounted file handles.
3. **Impact on LAAP's Brand:**
   * LAAP's documentation states: **`"anti-cheat: 100% safe"`** and **`"stealth presence launcher"`**.
   * LAAP currently operates strictly within Riot's sanctioned, documented local LCU REST and WebSocket interfaces.
   * **Directly embedding official skin injection into LAAP's core signed binary destroys its "100% Anti-Cheat Safe" guarantee.**

---

## 8. Strategic Recommendations & Options for LAAP

An AI agent or system architect designing the path forward for **LAAP** has three primary architectural avenues:

### Option A: The "Pure Rose" In-Client Model (Recommended for UX)
* **How it works:** Build a dedicated **Pengu Loader plugin** that renders custom cosmetic pickers directly inside the League client, controlled via a WebSocket bridge connected to LAAP's existing Tauri 2 backend.
* **Pros:** Seamless user experience; zero friction during Champ Select; lightweight codebase.
* **Cons:** Still requires a safe asset delivery mechanism (either companion repos or local WAD parsing).

### Option B: The "Decoupled Hybrid" Architecture (Recommended for Engineering & Safety)
* **How it works:**
  1. **Core LAAP Remains Clean:** The core LAAP launcher remains 100% focused on secure account switching, stealth presence, and safe LCU automation.
  2. **Isolated Plugin/Sidecar:** Cosmetic modding is decoupled into an optional, external open-source plugin or companion daemon.
  3. **Borrow Wildflover’s Local Asset Extraction:** Instead of relying on fragile GitHub repositories that face DMCA takedowns, use Python/Rust routines (`pyRitoFile` / `LtMAO` logic) to parse local `.wad.client` files directly on the user's disk.
  4. **Borrow Rose’s Clean LTK Integration:** Interface with LTK cleanly via standard CLI or headless commands without using Win32 API hooks or DLL injection.
* **Pros:** Preserves LAAP’s 100% safe reputation; eliminates DMCA dependency on remote skin repos; avoids dirty memory hacks.

### Option C: The "Full Wildflover" Re-implementation (Not Recommended)
* **How it works:** Re-implementing the standalone SkinLab, the `LeagueToolFlop` DLL suppressors, and cloud R2 marketplaces directly in Tauri.
* **Why to avoid:** Extremely high maintenance overhead, constant vulnerability to Vanguard heuristics, large installation footprint, and high risk of account penalties.
