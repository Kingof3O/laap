# Wildflover Technical Architecture & Reverse Engineering Analysis

Comprehensive technical analysis of **Wildflover** (version 4.0.7-x64), a third-party League of Legends skin management and client personalization suite. This documentation details its internal architecture, underlying open-source engines, headless patcher hijacks, asset manipulation pipelines, and cloud/P2P networking models discovered through static binary inspection.

---

## Architecture Blueprint

```mermaid
flowchart TD
    subgraph UI_Native_Shell ["Desktop Application (Tauri / Rust)"]
        UI["Frontend UI (React/Web on WebView2)"]
        Tauri["Rust Core & Tauri IPC Dispatcher"]
        UI <-->|IPC Commands| Tauri
    end

    subgraph LTK_Bridge ["LTK Subsystem (Headless Patcher Bridge)"]
        Flop["LeagueToolFlop.dll ('BIG FLOP')"]
        LTK["LTK Manager (Window Suppressed)"]
        Flop -.->|JS Injection & Window Hook| LTK
        Tauri <-->|Local HTTP/TCP API| Flop
    end

    subgraph Asset_Engine ["Asset & Normalization Engine"]
        PyEnv["Embedded CPython 3.9 Runtime"]
        BaseNorm["ltk_base_skin.py (Bypass Engine)"]
        FantomeFix["fix_custom_fantome.py"]
        LtMAO["LtMAO / pyRitoFile"]
        RitoBin["ritobin_cli.exe"]
        CDTB["hashes.game.txt (203MB Dictionary)"]
        PyEnv --> BaseNorm
        PyEnv --> FantomeFix
        BaseNorm --> LtMAO
        BaseNorm --> CDTB
    end

    subgraph Client_Mods ["Client Personalization"]
        Pengu["Pengu Loader v1.1.6"]
        LCU["Riot LCU API (127.0.0.1:port / ws://)"]
        Tauri -->|Auto-Inject Themes| Pengu
        Tauri <-->|Gameflow / Pick Detection| LCU
    end

    subgraph External_Network ["Cloud & Network Services"]
        CF_API["Cloudflare Workers (wildflover-api)"]
        R2["Cloudflare R2 Storage (Catalog/Mods)"]
        P2P["Peer-to-Peer Protocol (Party Sync)"]
        OPGG["OP.GG API (Stats & Runes)"]
        TTS["ElevenLabs / StreamElements TTS"]
        Tauri <--> CF_API
        Tauri <--> R2
        Tauri <--> P2P
        Tauri <--> OPGG
        Tauri <--> TTS
    end

    Tauri -->|Orchestrates| PyEnv
    Flop -->|Mounts Overlay Filesystem| Game["League of Legends Game Client"]
```

---

## Documentation Index

| File | Topic | Key Findings |
| :--- | :--- | :--- |
| **[`01-system-architecture.md`](./01-system-architecture.md)** | Core Structure & Tech Stack | Tauri/Rust foundation, NSIS installer, CS-LoL to LTK migration timeline |
| **[`02-ltk-patcher-and-bridge.md`](./02-ltk-patcher-and-bridge.md)** | Headless Patcher Hijack | `LeagueToolFlop.dll`, window suppression, WebView injection, local TCP/HTTP server |
| **[`03-skin-normalization-bypass.md`](./03-skin-normalization-bypass.md)** | LTK Anti-Skinhack Bypass | `ltk_base_skin.py`, Identity Borrowing, Mesh Repointing (`_nmx` extension + padding) |
| **[`04-mod-tooling-and-skinlab.md`](./04-mod-tooling-and-skinlab.md)** | Modding Pipeline & SkinLab | Embedded LtMAO, `pyRitoFile`, `ritobin`, `fix_custom_fantome.py`, SkinLab commands |
| **[`05-client-themes-pengu-lcu.md`](./05-client-themes-pengu-lcu.md)** | Client UI Themes & LCU | Pengu Loader integration, CSS/audio/font injection, LCU gameflow automation |
| **[`06-networking-p2p-and-cloud.md`](./06-networking-p2p-and-cloud.md)** | Networking, P2P & Cloud | Cloudflare Workers/R2 catalog, custom P2P chunk transfer, Discord RPC, OP.GG |
| **[`07-tauri-ipc-commands-reference.md`](./07-tauri-ipc-commands-reference.md)** | IPC Command Reference | Exhaustive catalog of ~80 Tauri IPC command handlers extracted from binary |
