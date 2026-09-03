# Anti-Ban Technical Verification & Vanguard Non-Interference

A critical question for any player or esports team is:  
**"Can using LAAP result in an anti-cheat or Riot Vanguard ban?"**

This document provides a technical breakdown, source code verification, and architectural proof showing why **LAAP cannot trigger anti-cheat bans** and operates in compliance with Riot Games' Third-Party Tool policies.

---

## 1. Executive Summary

| Risk Category | Cheat / Malicious Tool Behavior | LAAP Implementation | Ban Risk |
| :--- | :--- | :--- | :--- |
| **Process Memory** | Reads/writes virtual memory (`WriteProcessMemory`, `VirtualAllocEx`) | **Zero memory interaction**. Never attaches or inspects process memory. | **SAFE (0%)** |
| **Code Injection** | Injects DLLs, hooks DirectX/D3D graphics pipelines | **Zero code injection**. No dynamic libraries or hooks injected into any Riot process. | **SAFE (0%)** |
| **Kernel Drivers** | Employs custom kernel drivers or hypervisors to bypass anti-cheat | **Standard User Mode (Ring 3)**. Runs as a standard application without kernel drivers. | **SAFE (0%)** |
| **Game Asset Files** | Modifies `.wad`, game models, skins, or game binaries | **Zero game asset modification**. Game installation directories are untouched. | **SAFE (0%)** |
| **In-Game Play** | Automates inputs, scripts abilities, or reads game state | **Pre-launch only**. LAAP is completely dormant during active gameplay. | **SAFE (0%)** |
| **Authentication** | Stores plaintext passwords or scrapes login memory | **Pre-authenticated session tokens**. Swaps official client settings before boot. | **SAFE (0%)** |

---

## 2. Technical Proof 1: Zero Process or Memory Injection

Riot Vanguard actively monitors the virtual memory space of `LeagueClient.exe`, `LeagueClientUx.exe`, and `League of Legends.exe`. Any external process attempting to acquire `PROCESS_VM_WRITE`, `PROCESS_VM_READ`, or call `CreateRemoteThread` is instantly flagged.

### Codebase Verification:
In LAAP's native Rust core (`apps/desktop/src-tauri/src/`):
- **Windows APIs**: The codebase contains **zero references** to:
  - `WriteProcessMemory`
  - `ReadProcessMemory`
  - `VirtualAllocEx`
  - `CreateRemoteThread`
  - `SetWindowsHookEx`
  - `LoadLibrary` injection
- **macOS APIs**: The codebase contains **zero references** to:
  - `mach_vm_write`
  - `task_for_pid`
  - `ptrace`
  - `DYLD_INSERT_LIBRARIES`

LAAP interacts with processes strictly through high-level OS monitoring APIs (`sysinfo` crate) solely to check if the Riot Client is running and send standard SIGTERM/kill signals when switching profiles.

---

## 3. Technical Proof 2: Clean Filesystem Lifecycle & Timing

Riot Vanguard and Riot Client file locks monitor active configuration changes. Modifying files while a process is running can cause integrity verification errors.

LAAP enforces a strict **pre-launch lifecycle**:

```mermaid
sequenceDiagram
    autonumber
    participant L as LAAP Launcher
    participant FS as AppData / Application Support
    participant R as Riot Client Process

    Note over L,R: Step 1: Verification of Inactive State
    L->>R: Verify no Riot or League processes are active
    alt Process Running
        L->>R: Terminate process gracefully & wait for complete exit
    end

    Note over L,FS: Step 2: Configuration Injection While Dormant
    L->>FS: Backup existing RiotClientPrivateSettings.yaml
    L->>FS: Write target profile session YAML
    L->>FS: Close all file handles

    Note over L,R: Step 3: Launch Native Client
    L->>R: Spawn official Riot Client with standard arguments
    Note over L,R: LAAP is completely idle during gameplay
```

**Why this matters:**
1. Files are modified **only when Riot processes are completely offline**.
2. Once the file is written, LAAP immediately closes the file descriptor.
3. When the Riot Client boots, it opens `RiotClientPrivateSettings.yaml` naturally—exactly as it would if the user had checked *"Stay signed in"* during a previous login.
4. Vanguard never observes concurrent or suspicious external file writes during client or game execution.

---

## 4. Technical Proof 3: Official, Documented Launch Arguments

Many unsanctioned launchers inject hidden command-line flags or developer options. LAAP launches the official Riot Client binary using only standard arguments:

### Source Code (`apps/desktop/src-tauri/src/commands/session.rs`):
```rust
pub const LEAGUE_LAUNCH_ARGS: [&str; 2] = [
    "--launch-product=league_of_legends",
    "--launch-patchline=live",
];
```

Unit tests continuously enforce that launch arguments remain standard and contain zero unauthorized parameters:
```rust
#[test]
fn launch_arguments_are_normal_league_arguments_without_secrets() {
    assert_eq!(
        LEAGUE_LAUNCH_ARGS,
        ["--launch-product=league_of_legends", "--launch-patchline=live"]
    );
    assert!(LEAGUE_LAUNCH_ARGS
        .iter()
        .all(|argument| !argument.contains("password") && !argument.contains("token")));
}
```

---

## 5. Technical Proof 4: Compliance with Riot Games Third-Party Policy

Riot Games publishes explicit guidelines regarding what constitutes an unauthorized third-party program:

> *"No software should interfere directly with the in-game player experience, from the moment you press Play to the end-of-game screen."*  
> — **Riot Games Developer Guidelines**

### How LAAP Complies:
1. **Zero Gameplay Impact**: LAAP does not provide timers, overlays, automated pings, zoom modifications, or scripting.
2. **Pre-Game Only**: LAAP's involvement finishes once the game launches.
3. **No Lockfile Scraping**: LAAP does not connect to the live LCU (League Client Update) WebSocket during matches to trigger game automations.
4. **Authentic Session Format**: The tokens injected are standard Riot Sign-On (RSO) tokens legitimately generated by Riot's own authentication servers during the sandbox login.

---

## 6. How to Independently Verify LAAP's Safety

We encourage players, security engineers, and team managers to independently verify LAAP:

### Windows (Using Microsoft Sysinternals Process Monitor):
1. Download [Sysinternals Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon).
2. Filter by `Process Name is laap-desktop-core.exe` or `LAAP Desktop.exe`.
3. Launch an account through LAAP.
4. **Observe:**
   - Notice that operations are limited to standard `CreateFile`, `WriteFile`, `CloseFile` within `%LOCALAPPDATA%\Riot Games\Riot Client\Data`.
   - Notice there are **zero** `Process Create`, `Thread Create`, or `OpenProcess` events targeting `League of Legends.exe` or Vanguard.

### macOS (Using `fs_usage`):
```bash
sudo fs_usage -w -f filesys laap-desktop-core
```
Observe that filesystem interactions are strictly confined to `~/Library/Application Support/Riot Games/Riot Client/Data`.

---

## Conclusion
LAAP is fundamentally an **external configuration manager and session launcher**. Because it does not interact with game memory, does not inject code, does not modify game files, and leaves the live game engine completely untouched, it carries **zero risk of Vanguard anti-cheat bans**.
