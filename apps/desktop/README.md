# LAAP desktop

Basic includes two active local Riot profiles. Pro unlocks unlimited profiles in the same app. Both support League of Legends and VALORANT and share the existing Offline installer and update channel.

See [development and packaging](../../docs/DEVELOPMENT.md) for startup, verification, and installer commands. The canonical Tauri configuration is `src-tauri/tauri.conf.json` and the registered IPC handlers are in `src-tauri/src/lib.rs`.

[Billing setup](../../billing/README.md) covers license activation and checkout configuration. To publish Help & About links, set `VITE_LAAP_SUPPORT_URL`, `VITE_LAAP_PRIVACY_URL`, `VITE_LAAP_TERMS_URL`, and optionally `VITE_LAAP_RELEASE_NOTES_URL` in the build environment.
