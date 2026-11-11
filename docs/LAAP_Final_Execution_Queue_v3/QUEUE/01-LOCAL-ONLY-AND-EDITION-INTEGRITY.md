# TASK 01 — Lock the local-only architecture and three products

## Existing assets (inspect and reuse)

`apps/desktop/src-tauri/src/product.rs`, `lib.rs`, `local_store/`, `riot/`, `commands/local_accounts.rs`, `apps/desktop/src/product/flavors.ts`, `src/main.tsx`, `App.tsx`, `features/customization/CompleteApp.tsx`, legacy Team code, `apps/api`, `apps/admin`, `supabase/`, the three `tauri*.conf.json` files, `scripts/check-edition-isolation.mjs`.

## Do now

1. Diff current HEAD against the implementation report and 131-row matrix. Repair any real regression. No new edition taxonomy.
2. Enforce flavor compile-time and runtime gates: Basic lacks Studio module/IPC; Studio lacks vault, account provisioning, session interception, Presence and Team API; Complete includes local vault + Studio but never Team sharing. Verify compiled frontend and native registered command set, not UI visibility alone. Do not leak confidential fields through Rust serde types or community HTTP contracts.
3. Preserve `com.laap.offline` and existing Basic vault/keychain/updater; preserve `com.laaP.desktop` and transitional Team→Complete compatibility/update route; Studio unique `com.laap.studio`, local data root, updater feed. Check single-instance handling and co-install behavior. Never reset existing vaults or rotate keys.
4. Make a reversible, user-consented migration story for owners of older Team client installs: local-only account import only from properly authorized data they personally control; no silent upload/download of shared sessions. Verify old local profiles and encryption survive update. Preserve old backend/data for a separately authorized decommission process. Remove any *active* Team routes and dead pages from new products.
5. Add native tests, frontend bundle diff and E2E fixtures to prove all three gates. Verify account launch / switch / crash recovery / Presence regressions in Basic and Complete. Make `--features basic`, `--features studio`, default Complete tests explicit and CI-ready.
6. Correct misleading docs and controls. Explain accurately that there is no online Riot account vault but Studio/Complete can access other optional services.

## Acceptance

- Each SKU builds and has only its intended Tauri commands/features, not merely hidden buttons; permission tests attempt forbidden calls and receive rejection.
- Old local-account fixture decrypts after migration; 1-click launch/stop restrictions retain protections.
- Studio cannot see or read a Riot local-account vault; Basic cannot access new mod/party services.
- Both old app identities and their secure update trust preserved; migration report lists any untestable installed-user scenario.
- No backend destruction or production account migration occurs.
