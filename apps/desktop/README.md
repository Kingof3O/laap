# Desktop client core

The `src-tauri` crate contains the testable native boundary for a Tauri 2 shell. Keep native responsibilities isolated behind commands:

- `device`: OS keychain-backed Ed25519 identity and signed challenges.
- `monitor`: Windows/macOS process detection and the reconnect grace state machine.
- `launcher`: native Riot Client launch with no credentials or command-line secrets.
- `provider`: Riot/League process abstraction.

The React surface should consume typed command DTOs only; it should never receive raw credentials or private keys.

Run the native checks on a machine with the Rust toolchain installed:

```bash
npm run desktop:test
npm run desktop:check
```

The desktop shell authenticates LAAP operators, registers the OS-keychain-backed Ed25519 device identity, acquires signed account leases, opens the installed Riot Client without arguments, and reports process state. Riot authentication remains inside Riot's supported browser/client flow; no password or token is injected by LAAP.
