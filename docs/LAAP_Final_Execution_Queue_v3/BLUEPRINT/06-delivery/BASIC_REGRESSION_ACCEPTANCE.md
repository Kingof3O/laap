# LAAP Basic Must Remain Current LAAP (minus cloud Team)

The Basic edition IS the existing LAAP Offline functionality, not a free tier of the new customization product. Treat changes to any row below as a regression unless required to remove the old shared Team system while preserving local behavior.

| Existing functionality | Test |
|---|---|
| Local encrypted session vault | Load existing `laap_local_accounts.json` with existing OS key; no secret migration or cloud request |
| Add/capture local Riot account | Test native capture/provision consent, account identity, cancellation and rollback |
| Save/edit/delete/favorite account | Persistence across restart, case/region validation, no duplicate PUUID errors |
| One-click launch/switch | In-client transitions, active-match guard, recovery and safe shutdown |
| Profile notes, rank/region/icons | Existing UI persists, accurate cached icon display, opt-in existing LCU sync |
| Existing Presence controls | Existing online/away/offline presence controls unchanged and safe |
| Tray, hotkeys, window, settings | Baseline behaviors, keyboard/accessibility, close-to-tray and exit |
| Native updater | Existing Offline identity and pinned signed feed, installed-old→new verification |
| No Team | No Team tabs, API auth prompts, shared leases/assignment/device pool or remote session exchange |
| No Studio | No skin/chroma browser, custom mods, themes, creator, parties, marketplace, Studio license or Community API |

Performance: startup and idle memory may improve, but never regress against the old local-only launcher without reason and test evidence. No new service background daemons for Basic.
