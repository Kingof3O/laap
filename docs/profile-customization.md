# Profile customization

Released in [v0.4.3](https://github.com/Kingof3O/laap/releases/tag/v0.4.3). Documentation checked on 2026-10-14.

## User behavior

- Saved notes appear on cards, list rows and the selected-account strip, including line breaks.
- Add/Edit share a two-column editor with a live avatar, name, region and rank preview. The header and footer stay visible while long settings scroll.
- Region options are grouped into Europe, Americas, Asia, Oceania & SEA, and Middle East. Existing `SEA` records remain editable/filterable; new choices include SG, TW, VN, PH, TH and ME.
- The rank picker contains Unranked, seven divided tiers (IV–I), and Master/Grandmaster/Challenger. Previous custom ranks remain visible without silently changing their values.
- A local upload accepts PNG, JPEG or WebP, up to 5 MB and 4096 × 4096. Native code validates, crops/resizes to 128 × 128, and writes a PNG with original metadata removed. A missing image falls back to initials.
- League icons use the official Data Dragon catalog. The catalog is cached; thumbnail downloads happen only after an explicit download/online-preview action. The picker is searchable by icon ID because the published Data Dragon profile-icon catalog does not supply human-readable icon names. Visible thumbnails load with a maximum of three simultaneous requests.
- Icons are stored in the local LAAP `profile-assets` directory. Profiles store only safe asset references, not large base64 blobs. Reading saved avatars does not make network requests.
- All rank crests are bundled locally, so every selected rank remains available offline without a first-use download.

## Optional League Client sync

**Auto-sync icon on game login** and **Auto-sync rank on game login** are independent switches, off by default. They take effect after saving. Manual icon selection turns icon auto-sync off; rank auto-sync can remain on.

While LAAP and League Client are open, opted-in profiles are checked periodically (20 seconds). Only the saved profile matching the local client's PUUID is eligible. Profiles with no known PUUID must use Sign in again once to establish their identity. Auto-rank reads **Solo/Duo**, not Flex or TFT. Unknown/unavailable rank data preserves the existing rank.

LCU credentials are read from the running League process or its nearby lockfile. Authenticated GET requests are confined to `https://127.0.0.1:<port>`, with proxies and redirects disabled. A self-signed certificate exception applies only to that loopback client; normal certificate verification remains enabled for public Data Dragon downloads. No API key is needed and LCU passwords are not logged, stored or sent to an external host.

The current-summoner identity is checked again after downloads, and each opt-in is rechecked inside the vault write transaction. A cancelled opt-in or a different account cannot overwrite manual customization. A stale editor does not revert newer sync results while that sync remains enabled.

The Offline Edition retains `connect-src 'none'` for the webview. Explicit asset downloads and opted-in sync use narrow native commands; cloud sign-in/update polling stay disabled. `img-src 'self' data:` allows locally cached PNGs. Uploaded images never leave the device.

## Asset sources

- Official profile icons and catalog: [Riot Data Dragon documentation](https://developer.riotgames.com/docs/lol#data-dragon), `https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/profileicon.json` and `.../img/profileicon/{id}.png`.
- Ten current ranked emblems: [Riot's official ranked-emblems-latest.zip](https://static.developer.riotgames.com/docs/lol/ranked-emblems-latest.zip), linked from the [Riot Developer Portal](https://developer.riotgames.com/docs/lol#ranked-info).
- Unranked crest: [Riot client asset mirrored by CommunityDragon](https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/unranked.png).
- Assets were retrieved on 2026-10-14 and resized to 160-pixel PNGs for local use. Artwork belongs to Riot Games. The browser test fixture uses official profile icon 685 from Data Dragon 16.20.1.

## Verification

Production/offline builds, Rust checks/tests and browser tests cover metadata persistence, image normalization/cache reloads, notes in all layouts, live preview, grouped regions, all 32 ranks, opt-in independence, identity mismatch and opt-out races. A separate live Data Dragon smoke test passed:

```sh
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml riot_data_dragon_contract_is_usable -- --ignored
```

Live LCU integration still requires verification with an authenticated League Client on Windows/macOS. Automated tests use fixture responses and never stop a real game or modify a real user's profile.
