# Development and packaging

Checked against LAAP V2 source. Commands below run from the repository root.

## Requirements

Use Node.js 22 or newer, npm, and the current stable Rust toolchain. macOS needs Xcode Command Line Tools; Windows needs Visual Studio C++ build tools and WebView2. GitHub builds Windows x64 and universal macOS installers.

```sh
npm ci
```

## Local services

```sh
npm run dev
```

This starts the Node API on port 4170 and Vite admin UI on port 5173. Local API storage is SQL.js/SQLite; the development seed uses `admin@laap.local` and the configured `LAAP_ADMIN_PASSWORD` (development default `ChangeMe!2026`). See `apps/api/src/config.ts` for environment options. Production rejects the default password and missing production secrets.

## Native desktop

```sh
npx --workspace @laap/desktop tauri dev
```

Tauri starts Vite on port 1420 and opens the native window. Running `npm --workspace @laap/desktop run dev` alone starts only the frontend: browser previews show an explicit missing-IPC error for the local roster.

For an Offline frontend inside the native Offline window, override the development command as well as the edition config:

```sh
npx --workspace @laap/desktop tauri dev --config src-tauri/tauri.offline.conf.json --config '{"build":{"beforeDevCommand":"npm run dev -- --mode offline"}}'
```

The regular Offline config already selects `build:offline` for production packaging. Stop any existing port-1420 server before starting another Tauri dev process.

On an external macOS volume that generates AppleDouble files, keep Cargo output on a local volume:

```sh
CARGO_TARGET_DIR=/tmp/laap-desktop-cargo-target npx --workspace @laap/desktop tauri dev
```

`._*` files are ignored by Git. Do not recursively delete files from the workspace to prepare a commit.

## Verification

```sh
npm run test
npm run typecheck
npm run build
npm --workspace @laap/desktop run build:offline
npm --workspace @laap/desktop run test:sorting
npm --workspace @laap/desktop run test:lease-exit
npm --workspace @laap/desktop run test:updater
npx playwright install chromium
npm --workspace @laap/desktop run test:ui
cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

API tests use Vitest; the admin test script checks TypeScript. Playwright starts its own Offline frontend on port 1422, with native responses simulated only in tests. The profile-customization test writes current grid/editor/list screenshots to `.artifacts/profile-editor/`; copy reviewed images into `docs/assets/` when updating the gallery.

The explicitly ignored Data Dragon network smoke test is documented in [profile customization](profile-customization.md). Live-client validation limits are in [the verification report](desktop-hardening-verification.md).

## Packaging

Tauri runs the appropriate frontend build automatically.

```sh
# macOS, current architecture
npx --workspace @laap/desktop tauri build --bundles app,dmg
npx --workspace @laap/desktop tauri build --config src-tauri/tauri.offline.conf.json --bundles app,dmg

# Windows x64 (Complete & Offline & Studio)
npx --workspace @laap/desktop tauri build --bundles nsis,msi
npx --workspace @laap/desktop tauri build --config src-tauri/tauri.offline.conf.json --bundles nsis,msi
npx --workspace @laap/desktop tauri build --config src-tauri/tauri.studio.conf.json --bundles nsis,msi
```

Installers are written to `apps/desktop/src-tauri/target/release/bundle/`. Complete/Team builds produce `LAAP_*`; Offline/Basic builds produce `LAAP-Offline_*`.

### External / Sidecar Adapter Packaging (Studio & Complete Windows Builds)

Live custom mod activation uses the CLI contract in `apps/desktop/src-tauri/src/customization/game_adapter.rs` and is Windows-only. For future app-bundled sidecar packaging (`bundle.externalBin` alongside `laap-desktop-core.exe`) once `EXT-02`, `EXT-03`, and `EXT-04` gates are cleared—and keeping `tauri.offline.conf.json` (`basic`) strictly excluded—see [External & Bundled Mod Adapter Specification](EXTERNAL_MOD_ADAPTER.md).
