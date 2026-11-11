**Correction v2.0:** LAAP Basic is CURRENT LAAP local-account functionality only and stays free. LAAP Studio contains the supported Wildflover/Rose-style customizer (including optional online features). LAAP Complete is exactly Basic + Studio. Monetize original Studio/Complete value where permitted; never reintroduce remote Riot-account sharing.

# Commercial Launch Strategy and Pricing Experiments

## Business model recommendation

**Sell original workflow value** — local organization, convenient presets, creator workbench, validated user-created mods, premium themes, support and optional hosted community services — **not access to Riot-owned paid skins**. LAAP currently MIT-licensed, and public copies retain their MIT rights; you cannot retroactively remove that permission. New modules may be under a different license only if you own all contributed rights and meet third-party licenses.

## Riot compliance is a business gate, not a disclaimer checkbox

Riot's current League Developer Portal states products serving players must register; charging requires `Approved` or `Acknowledged` status, a free tier and transformative paid content. Riot specifically reserves action against skinhacks/unauthorized paid cosmetics, and restricts competitive automation/game integrity. See https://developer.riotgames.com/docs/lol, https://developer.riotgames.com/policies/general, https://www.riotgames.com/en/terms-of-service. **Written clarification on intended customization/mod operations and commercial model is strongly recommended** before offering paid modules. Approval for APIs is not automatically approval for patcher hooks or asset distribution.

## Product segmentation proposal (subject to approvals)

| Package | Free tier? | Why users choose it | Pricing experiment, not market fact |
|---|---|---|---|
| LAAP Basic | Yes | **current** encrypted local Riot accounts, launch/switch, existing presence, icons/ranks/notes/tray/updater; NO new Studio features | Free core |
| LAAP Studio | Trial/free creator-lite | professional creator workflow, asset validation, lint/repair, templates, batch export | Test US$12–20 lifetime OR US$3–5/mo with maintained features |
| LAAP Complete | Includes Basic free base + paid Studio/pro | all local accounts + professional customization and optional party/community conveniences | Test US$20–35 one-time; paid cloud services separately only if justified |
| Marketplace services | Browsing free | creator verification, hosting/download acceleration, optional premium support | No commissions until rights, tax and content moderation ready |

Wildflover advertises $7.50 lifetime and 24-hour trial on its public website, but its business model depends on features we should not assume are permissible. Above price hypotheses need real user interviews and willingness-to-pay tests.

## Distribution and sales funnel

1. Public website with exact feature/legal comparison, Windows/macOS limitations and no fake "100% ban safe" claim.
2. Free LAAP Basic binary + signed updater; Studio/Complete premium upsell only for original permitted product value.
3. Showcase screenshots/videos from real app and supplied legal community mods, with citations and creator credits.
4. Activation via Merchant of Record (MoR) webhook; device activation revocable but humane, offline grace and self-service recovery.
5. Refund/chargeback, update policy, support response time and privacy policy published.
6. Creator content marketplace after moderation and legal gates, not on day one.

## Payment processors for Egyptian operators (verify at onboarding)

- **Lemon Squeezy:** public supported bank payout countries include Egypt as of research date (https://docs.lemonsqueezy.com/help/getting-started/supported-countries); still subject to underwriting, content acceptability and bank/KYC checks.
- **Paddle:** official help states availability to software businesses outside excluded countries (Egypt not listed) https://www.paddle.com/help/start/account-verification/which-countries-are-supported-by-paddle. Approval not guaranteed.
- Compare actual fees, FX, tax handling, chargebacks and release delays before coding checkout. Do not hardcode provider to the first example.
- Do not promise PayPal/Bybit card payout workarounds. Use an appropriately verified settlement route.

## Product-specific risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Riot rejects mod/auto-pick/paid-skin functions | Critical | exclude, gated, direct policy inquiry; keep free compliant value |
| GPL or special binary license conflicts with proprietary sale | Critical | original code, dynamic external interface, counsel review, include notices |
| Wildflover functionality patent/copyright/trade-secret claims | High | clean-room product specification; no proprietary bytes, trademark or UI clone |
| Existing MIT repo enables forks and competition | Commercial | brand, support, premium new modules, hosted moderation, creator ecosystem; retain MIT attributions |
| Paid license service offline locks users out | High | signed license offline grace and free baseline available |
| Patcher breaks after game patch | High | compatibility canary/disable; diagnostic and external manager updates |
| Malware in marketplace packages | Critical | moderation + archive scan + quarantine + no executables |
| IP claims from creator packs | Critical | rights attestations, takedown process, creator terms, appeals |
| Refund fraud, resale, entitlement abuse | Medium | server-signed claims, rate limit, idempotent webhooks, fraud controls |

## Launch steps

- Phase P0 policy inquiry and creator rights inventory before selling.
- Phase P1 free Basic = existing local-only LAAP; Studio/Complete add original customization value in subsequent phases.
- Phase P2 Studio creator tools, presale interviews (no unauthorized feature claims).
- Phase P3 Complete app with clean local accounts, optional party metadata sync after privacy review.
- Phase P4 moderated marketplace, paid membership and optional cloud benefits after legal approval.

## Metrics without invasive telemetry

Opt-in aggregate crash/health data only (redact Riot IDs), first-run completion, real import success, preset reuse, return-to-app, converter failures, paid conversion, refund rate, support tickets, moderation queue. Offer full opt out; default no passive sensitive diagnostics.
