# Desktop client core

The `src-tauri` crate contains the testable native boundary for a Tauri 2 shell. Keep native responsibilities isolated behind commands:

- `device`: OS keychain-backed Ed25519 identity and signed challenges.
- `monitor`: Windows/macOS process detection and the reconnect grace state machine.
- `injection`: transient launch payload handling with `zeroize`.
- `provider`: Riot/League process abstraction.

The React surface should consume typed command DTOs only; it should never receive raw credentials or private keys.

Run the native checks on a machine with the Rust toolchain installed:

```bash
npm run desktop:test
npm run desktop:check
```

The current crate is intentionally UI-independent so it can be tested on Windows and macOS before adding the platform shell. `DeviceIdentity` stores a 32-byte Ed25519 secret in the OS keychain, `RuntimeMonitor` implements the 300-second reconnect grace state machine, and `SecureLauncher` drops zeroizing payload buffers without placing passwords on a command line.
