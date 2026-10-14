# Riot installation discovery and LAAP Presence

Custom Riot installation discovery and Windows presence shipped in v0.4.6. Automatic setup with a saved Online/Offline startup default and Windows tray/macOS menu-bar controls are included in v0.4.7. Live authenticated Riot chat still requires real-account validation.

![Current installer sidebar](assets/nsis-sidebar.png)

## Riot installations on other drives

Windows launch now discovers an existing `RiotClientServices.exe` from:

1. A saved, validated path override in Launcher Configuration.
2. `%PROGRAMDATA%/Riot Games/RiotClientInstalls.json`, including current/default/beta entries and associated clients.
3. The executable path of an already running Riot Client.
4. HKCU/HKLM Riot, App Paths, and uninstall registry entries in both 32-bit and 64-bit views.
5. Standard install folders and known Riot folders on mounted fixed/removable drives.

There is no recursive whole-drive scan. Missing or stale candidates are skipped. Quoted registry commands, environment variables, custom folder names and spaces are handled. The executable is launched directly, without passing a path through a shell. A launch plan resolves the path before clients are stopped or session files are changed, so missing installations do not interrupt a working client.

Open **Settings → Riot installation** to inspect the detected path/source, paste an override, or run **Detect again**. Overrides must point to an existing `RiotClientServices.exe` or its containing Riot Client folder. Leave the override empty for automatic detection.

## LAAP Presence

The product feature is named **LAAP Presence**. It is implemented inside the native Rust app. It does not install or launch a separate executable, inject code, create a fake friend, or automate gameplay.

Presence prepares automatically on Windows and macOS. New and upgraded settings default to **Online**. Choose **Appear offline** or **Online** as the default in Settings; this takes effect on the next LAAP start. The header or system-bar menu still changes the current session immediately. Settings also contains the default startup presence; saving that choice does not change the current session. macOS decodes the legacy certificate package using bundled OpenSSL and serves local TLS with rustls; Windows retains Schannel.

A client started normally needs an explicit restart through LAAP once to enable the proxy. The restart follows the same live-match confirmation guard as Stop/Switch. Once the session is routed, the header changes presence live by replaying the latest global presence stanza; it does not restart the client or game.

The UI distinguishes saved startup mode, waiting for routing/chat, an active filter, and errors. It reports the local filter state, not an independently verified friends-list result. Unknown or failed states never claim that offline presence is active.

Closing the LAAP window leaves it running in the Windows tray or macOS menu bar. Its menu shows current status, saved local profiles, presence controls, **Stop Riot**, **Open LAAP** and **Quit LAAP**. Cloud accounts stay in the main app because they require lease authorization. Quit uses the same live-match warning, cancels owned provisioning, restores the previous login, stops Riot and releases any cloud lease before exiting. A failed tray initialization leaves the existing visible-window close protection available.

## Troubleshooting setup

If detection cannot find Riot, open the official client once to refresh its record or paste the full executable path in Settings. If certificate setup fails, use **Retry presence** in the banner; a corrupt, expired or untrusted identity is rejected before launch.

The chat compatibility hostname must resolve to `127.0.0.1`. Some DNS services block names that resolve to loopback. You can inspect it on Windows with `Resolve-DnsName deceive-localhost.molenzwiebel.xyz -Type A`. Use a network-approved DNS configuration or a manually reviewed hosts entry if necessary. LAAP does not change system DNS or edit the hosts file.

## Transport and privacy

- Presence setup runs automatically. The saved startup default is Online unless the user chooses Appear offline in Settings. The Offline Edition's local vault mode is separate from online/offline game presence; automatic certificate setup can contact the network. If setup fails, an explicit **Allow normal Online launch** option permits an unfiltered launch. An Offline request never silently falls back to Online.
- Setup fetches and caches the reference project's public loopback TLS identity. The hostname is `deceive-localhost.molenzwiebel.xyz`; it must resolve only to `127.0.0.1`. This technical compatibility hostname does not change the LAAP feature name.
- Certificate downloads use HTTPS. A failed system-DNS route can retry using a fixed Google DNS-over-HTTPS query for the certificate provider's hostname. No user/account data is included. The download's normal TLS hostname verification remains enabled.
- Before launch, LAAP verifies the cached certificate chain, hostname and validity through a local TLS handshake. It does not install a root certificate or disable TLS validation. **Retry presence** obtains a renewed identity when needed.
- Configuration and chat listeners bind only to IPv4 loopback on dynamically allocated ports. Riot is launched with a local `--client-config-url` when presence is enabled.
- The configuration proxy forwards only required headers to Riot's fixed HTTPS configuration/affinity services. Redirects are disabled, upstream chat endpoints must be recognized Riot domains, and upstream TLS certificates are verified normally.
- The chat relay frames fragmented XML before changing global presence. Offline mode clears the game/activity payload and sets the global show state to offline. Online mode replays the original presence. Directed presence and chat messages, including lobby traffic, pass through unchanged.
- Authentication tokens and chat contents remain in memory, are not logged or persisted, and are not sent to LAAP's cloud API or the certificate/DNS services. The cached TLS identity is a public compatibility asset, not a user's Riot session.
- Proxy resources are stopped with the client. Setup, routing, certificate and connection failures remain visible and can be retried. Riot protocol changes can require an implementation update; no Riot-approval or ban guarantee is made.

## Verification

Native tests cover custom install records, stale paths, quoted registry strings, atomic preference writes, fragmented XML, directed chat, unknown activity removal, TLS/routing rejection, and changing presence on a live in-memory stream without restart. Browser tests cover custom-path settings, automatic setup, visible setup failure, explicit Online fallback, waiting/active states and guarded activation restart.

The host-platform public certificate contract is opt-in:

```sh
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml presence_public_certificate_contract -- --ignored
```

It downloads the current public identity, performs a real local TLS validation handshake and starts/stops the listeners. It never reads a Riot login or modifies a real user profile. The manual **Verify LAAP Presence transport** GitHub workflow runs this contract on Windows and macOS.

Live authenticated Riot chat/friends-list behavior still requires a supported Riot installation and real-account testing; fixtures and the local transport test do not establish that result.

## Reference attribution

Protocol research used [molenzwiebel/Deceive](https://github.com/molenzwiebel/Deceive), especially its configuration routing and presence filtering behavior. That project is licensed under GPL-3.0. LAAP uses an independent Rust implementation of the protocol behavior; it does not bundle that project's executable or copy its C# implementation. The public loopback certificate and hostname remain maintained by that project. Its copyright/licensing and availability are separate from LAAP's MIT-licensed code.
