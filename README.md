<div align="center">
<h1><img src="docs/assets/logo.webp" alt="LAAP — League Account Launcher" width="400" /></h1>

<p><strong>A desktop roster and launcher for League of Legends accounts.</strong></p>

<p><a href="https://github.com/Kingof3O/laap/releases/latest"><strong>Download for Windows or macOS</strong></a></p>

<p>
  <a href="https://github.com/Kingof3O/laap/releases/latest"><img src="https://img.shields.io/github/v/release/Kingof3O/laap?label=release" alt="Latest release" /></a>
  <a href="https://github.com/Kingof3O/laap/actions"><img src="https://img.shields.io/github/actions/workflow/status/Kingof3O/laap/test-and-lint.yml?branch=main&label=build" alt="Build status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
</p>
</div>

LAAP organizes saved Riot Client sessions into a personal roster, then launches the profile you choose. It also includes an optional Team edition for shared accounts and administration.

Windows installers are currently unsigned while the SignPath Foundation application awaits review. Windows may display Microsoft Defender SmartScreen's unknown-publisher warning. See the [code-signing policy](CODE_SIGNING.md) and [privacy policy](PRIVACY.md).

## Features

- **Personal roster:** Save account profiles with names, regions, rank, notes, favorites, and locally cached icons.
- **Find and organize:** Search, filter by region or rank, and sort by name, rank, last played, or date added.
- **Switch and stop safely:** Launch a saved session or close Riot and League processes while preserving saved logins. LAAP checks for an active game before stopping or switching.
- **Keep profile details current:** Sign in again to refresh an expired session without replacing its profile details. Optional icon and Solo/Duo rank synchronization is available with separate opt-ins.
- **LAAP Presence:** Set the default game presence at startup and control it from the Windows tray or macOS menu bar. The system menu also offers saved local profiles.
- **Two editions:** Choose the local Offline edition or the Team edition with shared accounts and administration.

## Editions

| Capability | LAAP Offline | LAAP Desktop (Team) |
| --- | --- | --- |
| Personal roster, profile notes, favorites, and sorting | Included | Included |
| Local image uploads and bundled rank crests | Included | Included |
| Riot icon downloads and League Client sync | Optional, user-controlled | Optional, user-controlled |
| Shared Accounts and administration | Not included | Private team service |
| Cloud API and update polling | Disabled | Team features and update checks |
| Windows downloads | EXE and MSI | EXE and MSI |
| macOS downloads | Universal DMG and app archive | Universal DMG and app archive |

Offline describes the edition's app services: it makes no cloud API or update requests. It is separate from the game-presence setting. Optional native commands can download icons from Data Dragon, connect to the local League Client when sync is enabled, or prepare LAAP Presence. These behaviors are documented in the [privacy policy](PRIVACY.md).

## Screenshots

The screenshots below illustrate core workflows. Profile images use test-only fixture data; the Shared Accounts image shows the signed-out screen. Test fixtures do not ship in production builds.

### Personal roster

<img src="docs/assets/launcher-grid.png" alt="Personal roster with account avatar, rank, notes, sorting, and Stop Riot controls" width="100%" />

<details>
<summary>More interface screenshots</summary>

**Edit a profile**

<img src="docs/assets/profile-editor.png" alt="Profile editor with avatar preview, region, rank, notes, and sync options" width="760" />

**Compact roster**

<img src="docs/assets/launcher-table.png" alt="Compact account list with notes, rank, avatar, and sorting controls" width="100%" />

**Team edition**

<img src="docs/assets/launcher-shared-accounts.png" alt="Team edition sign-in screen" width="100%" />

**Synchronization and startup**

<img src="docs/assets/profile-sync.png" alt="Account icon and rank synchronization status" width="100%" />

<img src="docs/assets/client-startup.png" alt="Riot Client startup tracking with duplicate launches disabled" width="100%" />

</details>

## Security and platform boundaries

LAAP does not ask for or store Riot passwords. It captures session material created by the official Riot Client. Session blobs are encrypted with AES-256-GCM using a key held in the operating system keychain. Profile details such as names, regions, ranks, notes, and favorites are stored locally as readable metadata.

Optional League Client sync uses authenticated, read-only requests to the local client. Presence uses local proxy services to route selected Riot traffic. Offline builds disable cloud authentication and update polling in the webview, but explicit native features can still make network requests as described above.

LAAP is an unofficial Riot client integration. It does not inject code, inspect game memory, or automate gameplay. These implementation details do not imply Riot approval or guarantee an account outcome. See the [security model](docs/SECURITY_MODEL.md), [native interaction notes](docs/ANTI_BAN_VERIFICATION.md), and [verification limits](docs/desktop-hardening-verification.md).

## Development

### Requirements

- Node.js 22 or newer and npm
- Current stable Rust toolchain
- Platform build tools: Xcode Command Line Tools on macOS; Visual Studio C++ build tools and WebView2 on Windows

### Start the applications

From the repository root:

```sh
npm ci
npm run dev
```

This starts the API and admin web interface. To start the native desktop app with its Vite frontend:

```sh
npx --workspace @laap/desktop tauri dev
```

Running `npm --workspace @laap/desktop run dev` starts only the frontend; browser mode reports that native IPC is unavailable. See the [development guide](docs/DEVELOPMENT.md) for environment configuration, Offline development, and packaging.

### Run checks

```sh
npm run test
npm run typecheck
npm run build
npm --workspace @laap/desktop run build:offline
npm --workspace @laap/desktop run test:sorting
npm --workspace @laap/desktop run test:lease-exit
npx playwright install chromium
npm --workspace @laap/desktop run test:ui
cargo check --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

The npm test script runs API tests and the admin TypeScript check. The desktop UI tests use simulated native responses; they do not authenticate to Riot or stop a real game.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/desktop` | React desktop interface and Tauri/Rust account orchestration |
| `apps/api` | Team API, authentication, account services, and leases |
| `apps/admin` | Team administration interface |
| `packages/types` | Shared API and application types |
| `packages/validation` | Shared Zod request schemas |
| `supabase/migrations` | Database migrations |

For architecture and data flows, see [Architecture](docs/ARCHITECTURE.md).

## Documentation

- [Profile guide: regions, ranks, icons, and synchronization](docs/profile-customization.md)
- [Riot installation discovery and LAAP Presence](docs/riot-installation-and-presence.md)
- [Security and storage model](docs/SECURITY_MODEL.md)
- [Privacy policy](PRIVACY.md) · [Code-signing policy](CODE_SIGNING.md)
- [Development and packaging](docs/DEVELOPMENT.md)
- [API reference](docs/API.md) · [Production operations](docs/PRODUCTION.md)
- [Changelog](CHANGELOG.md)

## License

LAAP source code is distributed under the [MIT License](LICENSE). League of Legends names and artwork belong to Riot Games; third-party assets and services are described in the [privacy policy](PRIVACY.md).
