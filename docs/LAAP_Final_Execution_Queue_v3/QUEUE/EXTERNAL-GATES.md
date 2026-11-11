# External dependencies that source code cannot make true

| Gate | Why it matters | Owner/action | Engineering fallback |
|---|---|---|---|
| Riot Developer Portal | Registration and product review; Approved/Acknowledged status for monetization | Product owner registers, submits, obtains applicable status | Implement permitted local catalog/creator tools; disable gated launch flows |
| Riot game-integrity assessment | Game-client modifications and third-party tools can be restricted | Obtain authoritative approval/permission where needed; monitor current policies | No memory hooks, skinhack unlocks, automation or unreviewed patcher adapter |
| LTK/Pengu and asset licensing | LGPL/GPL/MIT and patcher-specific redistribution terms differ; Riot artwork still owned by Riot | Legal/licensing review and vendor terms; retain notices | Original source, opt-in user-installed tools only if allowed |
| Signing keys/SignPath approval | Native upgrades require signed final artifacts and correct app identities | Authorized maintainer supplies signing secrets via protected CI, vendor approves Studio SKU | Ephemeral QA signing on isolated builds; no public auto-update claim |
| Windows/macOS machine testing | UI mocks and signed fixture files don't demonstrate real installers | Native Windows test system, macOS build/notarization hosts | Mark exact native scenario NOT VERIFIED |
| Hosted service domain + TLS | Production party and catalog need externally reachable WSS/HTTPS/CSP and operations | Domain, hosting account, config, monitored deployment | Localhost integration tests; safe 'not configured' in production |
| Discord/stats/AI/TTS | External app registration/API keys and provider terms | Account owner creates permitted provider integrations | Deterministic contract tests, UI unavailable state |
| Payment merchant | Real checkout and refunds need merchant/legal/tax setup, validated webhooks | Merchant-of-record/payment provider onboarding | Sandbox entitlement testing, no real charges |
| Publishing and retirement | Existing legacy service contains historical data and old users; releases affect users | Explicit final owner authorization and retention decision | Non-destructive rehearsals, release draft, legacy archive unchanged |

**Interpretation of user consent**: The user's willingness to assume risk is a product preference, not a substitute for another organization granting a license, permission or approval. Do not evade game security controls or falsely claim risk-free compatibility.
