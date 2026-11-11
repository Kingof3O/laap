# Wildflover vs Rose vs LAAP: Current Feature/Architecture Comparison

## What user dossier documents (unverified independent binary claims)

Wildflover v4.0.7 reverse-engineering notes describe Tauri/Rust + embedded CPython 3.9, bundled community tool binaries, a 203MB asset path dictionary, LTK hijacking through `LeagueToolFlop.dll`, asset normalization to defeat skinhack checks, SkinLab conversion, a 16-surface client themes system, P2P mod chunk sync and R2 marketplace. Those are **claims inside user-supplied analysis**, not independently validated source code. We do not ship its binary, bridge code or protection bypass.

Its public site independently advertises 2,100+ skins, 7,000+ chromas, 173 champions, local cache, 200+ community mods, client themes, app themes, profile images, TFT looks, automation, party chat/P2P sharing and lifetime pricing. These are vendor numbers/claims as of website research; no performance benchmarking was independently reproduced.

## Current Rose improvements over older dossier

Rose README and releases show: Pengu-based in-client plugin, skin/chroma selection, **custom mods for skins/maps/fonts/announcers** with `.fantome/.zip/.modpkg`, random/history, all 22 League languages, Swiftplay/Quickplay and Classic Rift support, party relay/reconnect and hash matching, late champion lock handling, no freeze when closing, 1.4.8 patch fixes. It also states that mimicking unowned Riot skins is disallowed and can lead to bans. Do not call Rose "policy-safe" or imply its core skin unlock behavior is available for unrestricted commercial reuse.

## Best mix

| Dimension | Wildflover standout | Rose standout | LAAP recommended |
|---|---|---|---|
| Primary UI | Desktop showroom/cached selections | In-client champ-select selection | Both, optional plugin and standalone desktop |
| Account workflow | No existing LAAP local vault | Separate launcher/backend | LAAP encrypted local profiles and account-bound presets |
| Catalog | Rich skins/chromas/showcase | In-client selection and cross-mode | Browsing metadata + legal community mods, policy constraints |
| Community library | Shop and downloads | Custom mods/multiple formats | Rights-aware local library + moderated service |
| Creator tools | SkinLab formats/converter/repair | Fewer authoring functions | Professional creator Studio with approved parsers and undo |
| Themes | Client media/fonts/music + app themes | Smaller UI custom selector | Local premium editor, opt-in supported loader and rollback |
| Party | Direct P2P chunk sync | Metadata/reconnect/plugin panel | Metadata relay first, optional consent transfers with integrity |
| Performance | Precompiled cache claim | Lightweight runtime | Rust cache, measured p95, game-aware background throttling |
| Maintenance | Proprietary hooks and Python bloat | Open source modular Python | Native Rust and optional supported adapters |
| Safety | Bypass behavior claims high risk | Warns of Riot policy risk | No bypass, explicit content rights and platform gate |
| Monetization | $7.50 claimed lifetime | Free MIT | Original workflow value + free tier only if Riot approves |

## Critical discrepancy: LTK patcher licensing

Open LTK Manager source is GPL-3.0-or-later, but its patcher binaries have a **separate July 2026 license** and special publisher-signing condition. The legal risk is more nuanced than saying "LTK cannot be redistributed" or "LTK is just MIT". We recommend user-installed licensed adapter by default. Link: https://github.com/LeagueToolkit/ltk-manager/blob/main/LTK-PATCHER-LICENSE.md

## What not to clone

- `LeagueToolFlop.dll` hooks, suppressed third-party windows, hijacked `__TAURI_INTERNALS__` calls.
- `ltk_base_skin.py` identity/mesh normalization for bypassing LTK's official skinhack protection.
- Entire Riot paid skins packaged as "community content" or trial entitlements.
- Automatic client/game process freeze or unverified match automation.
- Protected skins/TFT cosmetics as saleable assets without rights.

## True parity strategy

Feature coverage is **tracked**, not blindly copied. Each row in `FEATURE_PARITY_MATRIX.csv` states whether LAAP should implement, adapt, gate or exclude the capability, with the closest technical owner and relevant acceptance test. This is more actionable than promising that "all Wildflover functions" are safe to ship.
