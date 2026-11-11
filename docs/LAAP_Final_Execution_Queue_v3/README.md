# LAAP final completion handoff

This ZIP contains the **original corrected 80-file blueprint** (under `BLUEPRINT/`) plus the **new, bounded execution queue** (under `QUEUE/`). Everything is additive; the blueprint isn't rewritten.

**Recommended extraction:** into a NEW sibling folder `C:\pw\laap\docs\LAAP_Final_Execution_Queue_v3`. This keeps your existing `C:\pw\laap\docs\LAAP_Local_Customization_Blueprint` untouched. The new folder contains `BLUEPRINT/` (the unchanged corrected original) and `QUEUE/` (the new prompts). Point the agent at the new folder. Do not overwrite your existing `00-START-HERE.md`.

**Give the agent one prompt:** `QUEUE/00-RUN-ALL.md`. It will run eight phases sequentially, checking current code instead of starting over.

**Fallback for agent context limits:** Queue `QUEUE/01-...md` through `QUEUE/08-...md` as separate messages; every phase requires evidence and a bounded stop.

Policy and reference URLs:
- Riot General Policies: https://developer.riotgames.com/policies/general
- Riot League developer docs: https://developer.riotgames.com/docs/lol
- Riot third-party app guidance: https://support.riotgames.com/en-us/riot/events/third-party-applications
- Tauri v2 updater docs: https://v2.tauri.app/plugin/updater/
- League Toolkit Manager and licensing: https://github.com/LeagueToolkit/ltk-manager
- LTK Patcher license: https://github.com/LeagueToolkit/ltk-manager/blob/main/LTK-PATCHER-LICENSE.md
- Rose (reference only, not authorization for paid-skin unlocks): https://github.com/Alban1911/Rose
