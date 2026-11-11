# 01 - System Architecture & Component Layout

## Overview

Wildflover (v4.0.7) is packaged as a Windows 64-bit standalone installer (`Wildflover-4.0.7-x64-setup.exe`). Beneath its visual design, the application is built on modern native desktop technologies (Tauri + Rust) combined with an embedded Python 3.9 runtime and repurposed community-built League modding utilities.

---

## Packaging & Binary Structure

* **Installer Type:** NSIS-3 (Nullsoft Scriptable Install System) with Unicode and custom plugins:
  * `nsis_tauri_utils.dll`: Tauri NSIS installer bridge.
  * `wfui.dll` / `modern-header.bmp` / `wf-wizard.bmp`: Custom installer branding and wizard steps.
  * `NSISdl.dll`, `nsDialogs.dll`, `StartMenu.dll`, `UserInfo.dll`, `nsExec.dll`.
* **Main Binary:** `wildflover.exe` (~167 MB).
  * Built using **Tauri** (Rust backend interfacing with Microsoft Edge WebView2).
  * Compiles frontend assets directly into the binary data sections.
* **Total Installed Footprint:** ~454 MB uncompressed across 2,185 files.

### Top-Level Directory Layout
```
Wildflover/
├── wildflover.exe                  # Main Tauri application binary
├── LeagueToolFlop.dll              # Background LTK Manager bridge & hook
├── ltk-manager-setup.exe           # Bundled League Toolkit (LTK) manager
├── filetype.ico                    # Windows file association icon (.fantome, .wf)
│
├── managers/                       # Binary utilities for WAD and property files
│   ├── mod-tools.exe               # League mod archive packer (from cslol)
│   ├── wad-extract.exe             # WAD archive extractor
│   ├── wad-make.exe                # WAD archive creator
│   ├── ritobin_cli.exe             # Binary property sheet (.bin) compiler/decompiler
│   ├── cslol-dll.dll               # 2 KB inactive dummy stub
│   ├── hashes.game.txt             # 203 MB CDTB xxHash64 dictionary
│   └── _backup_RESTORE.txt         # Internal developer migration notes
│
└── runtime/                        # Python runtime & modification scripts
    ├── python/                     # Embedded CPython 3.9 runtime + standard packages
    │   ├── python.exe, pythonw.exe, python39.dll
    │   └── Lib/site-packages/      # Dependencies (xxhash, pyRitoFile, etc.)
    ├── _vendor/
    │   ├── LtMAO/                  # League of Legends Modding Tools suite
    │   └── ritobin_cli.exe
    ├── bridge/
    │   ├── ltk_base_skin.py        # Base skin normalizer & anti-skinhack bypass
    │   ├── run_fix.py              # Subprocess bridge wrapper with UTF-8 stdio
    │   └── scan_mod.py             # Mod scanner and dependency inspector
    ├── fix_custom_fantome.py       # Standalone engine for fixing broken .fantome files
    └── README.txt                  # "Wildflover Fixer runtime (prepared by Zavith)"
```

---

## Architectural Evolution: CS-LoL to LTK Migration

Internal developer documentation preserved within `managers\_backup_RESTORE.txt` explicitly documents the architectural pivot that took place in late 2026:

```
WILDFLOVER — DLL/mod-tools YEDEK ve GERİ YÜKLEME NOTU
=====================================================
Canlı (uygulamanın okuduğu) konumlar:
  - Repo:       managers\cslol-dll.dll + mod-tools.exe   (tauri build buradan paketler)
  - Dev:        src-tauri\target\debug\managers\          (npm run tauri dev buradan okur)
  - Kurulu app: C:\Program Files\Wildflover\managers\     (admin gerekir)

2026-09-25 LTK GEÇİŞİ:
  managers\cslol-dll.dll artık işlevsiz bir STUB (2 KB, tools\build_cslol_stub.py ile derlenir).
  mod-tools yalnızca import/mkoverlay için; overlay'i LTK patcher sunuyor
  (%LOCALAPPDATA%\Wildflover\ltk-patcher\). Gerçek cslol-dll _backup_cslol_apr\ içinde —
  runoverlay kodu kaldırıldığı için onu geri koymak enjeksiyonu geri getirmez.
```

### Why the Pivot Occurred:
1. **Anti-Cheat Enforcement:** With Riot Vanguard operating at kernel level, direct DLL injection into `League of Legends.exe` via `cslol-dll.dll` became increasingly fragile, detected, or blocked.
2. **Adoption of LTK:** The developers pivoted to **League Toolkit (LTK)**, a newer community-maintained filesystem overlay patcher that runs outside the game process and mounts virtualized WAD files directly.
3. **Stubbing Old Code:** Instead of redesigning the entire build system, `cslol-dll.dll` was replaced with a non-operational 2 KB stub, and `mod-tools.exe` was retained solely for unpacking and constructing overlay staging trees (`mkoverlay`).
