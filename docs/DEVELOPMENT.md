# Development and packaging

Use Node.js 22 or newer, npm, and stable Rust. Windows requires the Visual Studio C++ Build Tools and WebView2. macOS requires the Xcode Command Line Tools.

## Development

```sh
npm ci
npm --workspace @laap/desktop run tauri dev
```

Run `npm run dev` for the browser UI preview. Desktop operations require the Tauri host. Playwright starts its own preview with isolated native fixtures.

Copy the relevant values from [the environment example](../.env.example) into your local build environment. See [billing setup](../billing/README.md) for Worker secrets and sandbox checkout.

## Verification

```sh
npm run build
npm test
npm --workspace @laap/desktop run test:sorting
npm --workspace @laap/desktop run test:updater
npx playwright install chromium
npm --workspace @laap/desktop run test:ui
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Packaging

Run `npm --workspace @laap/desktop run tauri build` on the target OS. For universal macOS packaging, install both Rust Darwin targets and pass `--target universal-apple-darwin`. The default Tauri configuration produces the existing `LAAP Offline` bundle identity. Find the platform installers under `apps/desktop/src-tauri/target` in the release bundle directory.

See [production operations](PRODUCTION.md) and the [code-signing policy](../CODE_SIGNING.md) for release gates and signing.
