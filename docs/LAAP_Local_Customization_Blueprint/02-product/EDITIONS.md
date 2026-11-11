# Authoritative Product Capability Matrix (v2.0)

**F** = full included existing capability; **S** = Studio module available in this build (subject to policy/platform/entitlement); **X** = not compiled or active; **G** = gated/disabled until authorizations. New Studio modules MUST NOT be added to Basic.

| Feature | Basic | Studio | Complete | Notes |
|---|:---:|:---:|:---:|---|
| Existing local Riot accounts (encrypted AES-GCM + keychain) | F | X | F | Local machine only; no cloud vault |
| Add/import/capture/launch/switch/recover/delete local sessions | F | X | F | Preserve existing protections |
| Existing roster notes/favorites/rank/icons, icon/rank auto-sync | F | X | F | Basic exactly current LAAP functionality |
| Existing Presence, tray, Settings and signed updates | F | X* | F | *Studio has its own tray/settings/signed updater but no account Presence feature |
| New champion/skin/chroma catalog, advanced filtering/preview | X | S | S | Browse metadata; official paid unlock excluded |
| Favorite/random/history/form/color/queue-mode selection presets | X | S | S | Metadata/preferences; application gated |
| Studio content-addressed mod library; .fantome/.modpkg/ZIP safe import | X | S | S | Licensed and validated user-created mods |
| Client theme editor: background, video, fonts, music, CSS, transitions | X | S | S | Supported integrations/consent only |
| Creator workbench / converters / inspect / diff / safe fix/pack | X | S | S | License and format gates |
| Optional in-client companion / supported external tool adapters | X | G | G | Separate compatibility/security/policy approval |
| Studio presets linked to locally saved Riot account IDs | X | X | S | Studio has global/champion presets without a vault |
| Party rooms, sync, reconnect, member visibility | X | S | S | Online relay, no Riot login session transport |
| Content-hash matching + opt-in permitted mod transfer | X | G | G | Rights/privacy/malware review |
| Online creator/mod marketplace, approved downloads, ratings/reporting | X | S | S | Hosted service independent of Team API |
| Discord, authorized stats, opt-in AI/TTS | X | S | S | Provider terms, privacy/consent |
| Premium entitlements / license server | X | S | S | Basic core free without activation requirement |
| Studio cache, compatibility doctor, low-resource mode | X | S | S | Separate from Basic's current app safeguards |
| Legacy Team account sharing/leasing/admin assignments | X | X | X | Migration-only compatibility, no new active use |
| Official Riot paid-skin unlock and Wildflover's bypass/hooks | X | X | X | Excluded |

## Exactly how bundles should work

- **Basic**: public display name **LAAP Basic**, internal flavor `basic`, preserve existing Tauri Offline identifier `com.laap.offline`, app-data/OS keychain and signed `latest-offline.json` feed. Reuse the existing `tauri.offline.conf.json` (or narrow overlay), not a newly invented identity. All existing profile icon/rank customization stays; this is NOT a skin or mod editor.
- **Studio**: **LAAP Studio**, flavor `studio`, new `com.laap.studio` identifier, isolated customization data root, unique signed feed `latest-studio.json`, zero local vault IPC, optional network-powered catalog/party/creator services.
- **Complete**: **LAAP Complete**, flavor `complete`, preserve the old `com.laaP.desktop` identity for signed Team→Complete migration and `latest-team.json` transition feed; all existing local launcher features plus all supported Studio features. Introduce `latest-complete.json` only with explicit compatibility migration proving old installations can update. **No remote shared Riot vault**.

## Online service rules

**Network ONLINE for Studio and Complete, but never for Riot account storage:** default service availability is on in capable products, but features using personal data, external processes, third-party accounts or media transfers obtain consent and offer disable/logout. Package catalog metadata and signed updates can be fetched when allowed; Riot network connectivity for normal game launch is independent.

Host a new `apps/community-api` service with separately scoped authentication for party membership, creator profile, moderated listing, reports, content licenses, purchase entitlements. `apps/api`/`apps/admin` Team account service is NOT reused as-is. None of these endpoints accepts Riot `session_blob` or auth material.

## Product enforcement

- Build-time and native IPC compile/registration gates, not just hidden React buttons. `basic` builds must omit new Studio UI+commands, and `studio` builds must omit local vault; all active Team routes/leases must be absent from production clients.
- Separate auto-updater manifests and signatures, app IDs, data roots, feature flags, screenshots and packaging proof. Maintain signed transitional upgrade routes from both existing identities.
- External patcher/skin application, in-client plugins and automation are conditional; no claim of zero ban risk or approval. Payment/paid launch conditioned on Riot registration and Approved/Acknowledged status.
