# 02 - Headless LTK Hijack & Bridge (`LeagueToolFlop.dll`)

## Overview

Rather than writing a proprietary kernel or filesystem driver to inject skins into League of Legends, Wildflover packages and leverages **League Toolkit (LTK) Manager** (`ltk-manager-setup.exe`). 

To prevent the user from realizing that LTK Manager is running, and to control it programmatically, Wildflover injects a custom native DLL named **`LeagueToolFlop.dll`** (internally dubbed *"BIG FLOP"*, credited to `lol123love`).

---

## Reverse Engineering `LeagueToolFlop.dll`

Inspection of the binary export/import tables and string references reveals three core mechanisms:
1. **Window suppression / Headless hook**
2. **WebView JavaScript injection & state spoofing**
3. **Local authenticated HTTP/TCP control server**

### 1. Window Suppression (Headless Execution)
LTK Manager is a desktop app designed to show a visual GUI window. `LeagueToolFlop.dll` hooks user-space window management Win32 APIs in LTK's process to suppress all GUI display:

```
[Hide] %d window-show import(s) patched - the LTK Manager window stays hidden
[Hide] suppressed a show of the LTK Manager window
[Hide] no window-show import found in this build - falling back to the polling hide
```

**Intercepted APIs:**
* `ShowWindow` / `ShowWindowAsync`
* `SetWindowPos`
* `SetWindowPlacement`
* `SetWindowLongW` / `SetWindowLongA` / `SetWindowLongPtrW` / `SetWindowLongPtrA`
* `EnumWindows` / `GetWindowThreadProcessId`

Whenever LTK attempts to display its window, the hook intercepts the call and forces the window state to hidden (`SW_HIDE`), while letting its background event loops and overlay threads run unobstructed.

---

### 2. WebView Injection & Tauri IPC Hijack
LTK Manager is itself a Tauri-based application. `LeagueToolFlop.dll` injects JavaScript into the running WebView2 instance to hijack LTK's internal IPC:

```javascript
// Discovered in binary strings:
(async () => { 
  try { 
    const r = await window.__TAURI_INTERNALS__.invoke( ... );
  } catch(e) {}
})();

if (window.__ltk_health_spoofed) return 'already';
if (!window.__TAURI_INTERNALS__ || !window.__TAURI_INTERNALS__.invoke) return '';
window.__ltk_health_spoofed = true;

const orig = window.__TAURI_INTERNALS__.invoke;
window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
  // Intercepts and spoofs LTK internal commands
};
```

**Targeted LTK Tauri Commands:**
* `plugin:patcher|start_patcher`: Starts the LTK virtual overlay filesystem.
* `plugin:patcher|stop_patcher`: Unmounts the overlay.
* `plugin:patcher|get_patcher_status`: Polls whether the patcher is actively attached to League.

---

### 3. Local TCP/HTTP Control Server
`LeagueToolFlop.dll` hosts an authenticated local HTTP/TCP micro-service to bridge Wildflover with the hijacked LTK process:
* **Registry Key:** `HKCU\Software\LTKBridge`
  * Values: `ApiPort`, `ApiToken`
* **Port Range:** Configured via environment variables `LTK_API_PORT` or `CELESTIAL_API_PORT`.
* **Endpoints & Operations:**
  * `/import`: Stages `.fantome` files into `LTKBridge_Staging\ImportedMod.fantome`.
  * `/start_patcher`: Triggers the patcher engine.
  * `/stop_patcher`: Halts overlay injection.
  * `/patcher_status`: Returns patcher health and game attachment status.
* **Authentication:** Checks `Authorization: Bearer <token>` or URL query token. Missing/invalid token responds: `"unauthorized: missing or wrong token"`.
* **Logging:** Writes runtime operational diagnostics to:
  * `C:\Users\Public\ltk_bridge.log`
  * `C:\Users\Public\ltk_api.log`
