# Edition, Capability and Distribution Contract

## SKU matrix (F = always included; O = optional licensed/opt-in; X = not compiled; G = policy-gated)

| Capability | Local | Studio | Complete | Gate / platform |
|---|---:|---:|---:|---|
| Personal Riot account roster / encrypted vault | F | X | F | Windows/macOS existing capabilities |
| Capture, import and local account switch | F | X | F | Existing Riot session safety retained |
| Local library (custom permitted mods) | F | F | F | Local files; Windows applied mods depend on approved adapter |
| Champion/skin/chroma browse-only catalog | F | F | F | Download/cached metadata; no official-skin unlocking |
| Per-champion/per-account presets | F | F (global/per-champion) | F | Binding to account only where vault exists |
| Client themes CSS/background/fonts/music | F | F | F | Explicit loader + policy gate; macOS tested separately |
| Performance/caching/compatibility doctor | F | F | F | Local, no external service needed |
| Import `.fantome`, `.modpkg`, `.zip` | F | F | F | Sanitized, asset rights and mod compatibility gate |
| Creator Studio / converters | O | F | F | Licensed libraries; no copying GPL into proprietary core |
| Party rooms, metadata sync | O | O | F | Optional online + explicit consent |
| Party binary mod transfer | G | G | G | Opt-in, safe content, no protected assets; network review |
| Community marketplace/discovery | O | O | F | Needs hosting, moderation and rights review |
| Discord RPC | O | O | O | User consent + Discord API terms |
| OP.GG/manual stats viewer | O | O | O | Provider permission and noncompetitive data use |
| TTS/AI commentary | O | O | O | Permission/privacy/licensing review; no gameplay advantage |
| In-client selector plugin | G | G | G | Pengu compatibility, Riot policy and safe unload |
| Cosmetic game-file application | G | G | G | Supported external adapter, no bypass, explicit risk notice |
| Riot official paid-skin unlock | X | X | X | Excluded |
| Headless DLL-hook / validator evasion | X | X | X | Excluded |
| Auto ban/pick/lock gameplay automation | G | G | G | Not enabled before Riot-policy review |
| Team vault, leases, admin assignments | X | X | X | Retirement/migration code only |

## Feature flags vs entitlements vs consent

- **Compile capabilities**: target product can physically invoke feature. Example `CAP_LOCAL_VAULT=false` in Studio must omit local vault command registrations entirely, not just hide a tab.
- **Platform capabilities**: `Windows`, `macOS` and runtime detection. Disable unsupported patcher operations with clear explanations.
- **Policy gates**: centrally versioned allowlist per feature; default deny; signed config may disable but must not remotely enable prohibited functionality without a reviewed release.
- **Entitlements**: optional premium creator tools, storage quotas, hosted services. Never determine access purely from frontend flags.
- **Consent**: each external integration, client modification and network transfer requires a separate opt-in; revocable.

## Suggested packaging mechanics

- Keep `apps/desktop` as shared React/Rust source.
- Add three explicit flavor configs and `src/product` descriptors. Use Tauri config overlays and production-build-time env, not mutation of files during release.
- `local`: build with `--config src-tauri/tauri.local.conf.json`, preserve `com.laap.offline`, its existing key and updater endpoint.
- `studio`: new product `com.laap.studio`, new icon/product name/protocol, key and feed.
- `complete`: keep legacy `com.laaP.desktop` as compatibility anchor; `team` identity remains ONLY internal migration name, never UI product name.
- Separate pinned signed update feeds; CI tests that each manifest's platform + edition metadata match a signed artifact from that build.
- Respect existing local app data locations; studio uses a separate root. Complete can access existing Local vault only via approved migration/permission, not copy secrets into Studio store.

## Pricing hypotheses (not commitments)

Free Starter required if selling in Riot's app ecosystem, subject to registration/approval:
- `Local` core free; optional creator/pro workflow upgrade, **not locked Riot content**.
- `Studio Creator`: e.g. US$12–20 one-time for original creator workflow/value, or a small subscription if recurring hosted benefits justify it.
- `Complete`: e.g. US$20–35 one-time, with limited paid support/creator tools; recurring hosting may be a distinct opt-in service.
- Revenue from marketplace commissions only after licensed creator content and moderation exist.

Prices above are **experimental hypotheses** for customer discovery; Wildflover's current public $7.50 lifetime offer is market context, not a license to clone the paid-skin product.
