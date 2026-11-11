# Differences from the earlier LAAP Local + Customization blueprint

## Changed by explicit user request
- **Removed all proposed Wildflover/Rose features from the Basic SKU.** Old version wrongly said local launcher would also have custom mods, themes, champion catalog and presets. Basic is strictly current LAAP Offline functionality with shared Team mode removed.
- **Renamed the local SKU label to LAAP Basic** while preserving historical `com.laap.offline` app and pinned feed/OS keychain/data storage.
- **Studio alone now owns the complete supported new customization feature stack**, including optional online Wildflover-style community capabilities.
- **Complete = Basic + Studio**, no less and no more, including local-account-linked customization presets and all supported online Studio features.
- **Online Team/shared Riot vault retired**, *not* the internet or community/cloud services in Studio/Complete.
- Corrected feature parity scope (131 original rows), edition matrix, source file manifest, UI screen entitlement rules, product config, agent master prompt, task skills, QA gates, migration and commercial plan.

## Files to treat as authoritative
`00-START-HERE.md` → `02-product/EDITIONS.md` → `02-product/BASIC_STUDIO_COMPLETE_FEATURES.csv` → `07-contracts/product-flavors.json` → `06-delivery/MASTER_AGENT_PROMPT.md`.

## Existing behavior that must be preserved
Basic: add/import/capture/launch/switch local accounts; AES-GCM keychain vault; favorites, notes, ranks/icons and optional sync; Presence, tray, settings, updater and error recovery. This is not an invitation to add a skin browser to Basic.

## Not changed
Compatibility/rights constraints, Riot policy, source license approvals, no official paid-skin piracy/protection bypass, existing public MIT rights, isolated creator/community services and no production release without authorization.
