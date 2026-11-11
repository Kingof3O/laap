# PASTE THIS ONCE INTO THE AGENT

You are the principal LAAP implementation engineer. Finish the EXISTING project in `C:\pw\laap` using the v2 corrected blueprint and v3 execution queue inside `C:\pw\laap\docs\LAAP_Final_Execution_Queue_v3\BLUEPRINT` and `C:\pw\laap\docs\LAAP_Final_Execution_Queue_v3\QUEUE` (also reconcile the preexisting `C:\pw\laap\docs\LAAP_Local_Customization_Blueprint` if it exists). These are implementation instructions, not an invitation to generate another speculative plan.

## Required sequence

1. Read and obey the source precedence in `00-START-HERE.md`, `BLUEPRINT/00-START-HERE.md` if available, and all authoritative `02-product`, `03-architecture`, `04-features`, `05-business`, `06-delivery`, `07-contracts` materials and applicable `skills/` from the corrected blueprint. Read the current repository; record current HEAD SHA and evidence matrices.
2. Immediately implement `QUEUE/01-LOCAL-ONLY-AND-EDITION-INTEGRITY.md`.
3. Then implement `QUEUE/02-CATALOG-PRESETS-AND-LOCAL-STUDIO.md`.
4. Then implement `QUEUE/03-MOD-LIBRARY-AND-CREATOR.md`.
5. Then implement `QUEUE/04-THEMES-GAMEFLOW-AND-ADAPTER-GATES.md`.
6. Then implement `QUEUE/05-PARTY-AND-MARKETPLACE.md`.
7. Then implement `QUEUE/06-INTEGRATIONS-AND-COMMERCE.md`.
8. Then implement `QUEUE/07-CI-INSTALLERS-AND-UPDATERS.md`.
9. Finally implement `QUEUE/08-FINAL-E2E-AND-STOP.md`.

## Implementation discipline

- **ONE engineering executor; NO subagents.** No approval pauses for ordinary engineering choices. Work directly in the repo, inspect existing implementation before editing, and reuse proven working code. Implement, test and fix; do not finish with a plan or TODO-only documentation.
- Preserve Basic's existing experience and encrypted vault. Do not resurrect Team cloud account sharing. Studio has zero vault features. Complete includes both products' permitted features.
- No fake UI, hardcoded production user data, placeholder backend responses, dead buttons, or API calls that appear to work but only manipulate UI state. Production pages must show honest empty, unavailable, unsupported, permission-required and retry states when a service isn't ready.
- Strict modular code; typed contracts; bounded resource use; secure persistence, cancellation, structured diagnostics, rollback and graceful offline behavior. Avoid god components/services and duplicated frontend/native logic.
- Take the definitive 131-row parity matrix as a checklist, not a requirement to recreate unpermitted competitor techniques. Add a per-row status and evidence record in `docs/implementation-tracking/`. Full coverage means every row is `VERIFIED` or `EXPLICITLY GATED/EXCLUDED`, with no unacknowledged missing row.
- Policy and third-party licenses are not overridden by the user's willingness to take account risk. Do not create paid Riot skin unlocking, cryptographic/validator bypasses, process-hijacking DLLs or unauthorized anti-cheat evasion. For uncertain game-client operations, implement and thoroughly test independent, supported functionality; leave game-altering adapters disabled until rights and relevant approvals are established.
- For platform tests, distinguish actual native executable/installer tests from browser IPC mocks, simulated installer tests, and code-level unit tests. Never call them equivalent.
- Produce a **finished phase report** after each phase: exact files edited, original requirement IDs covered, tests (commands/results), security negatives, screenshot/Windows-native evidence where applicable, issues, and next phase.
- No deployment, public GitHub release, actual payment processing, credential rotation, Riot account action, destructive data migration or production database deletion without explicit authorization. You may prepare scripts, configuration templates, rehearsals and sandbox verification.

## Stop rule / non-infinite-loop contract

Run tasks 01→08 once. Revisit an earlier phase ONLY for an evidenced regression from a later phase, never for speculative or purely aesthetic refinements. Two UI polish passes maximum unless a functional/accessibility defect is demonstrated. At phase 08, issue a final `DONE / GATED / NOT VERIFIED` matrix and **STOP**. Never append a ninth audit/refactor iteration without a new user request.

If an external dependency (Riot approval, vendor credentials, merchant account, code-signing secret, production domain/TLS, direct game-machine access) is absent: complete its code, contracts, deterministic/sandbox tests, instructions and safe inactive UI; mark `EXTERNAL BLOCKER` with the exact required user/vendor action. Do not invent approvals, mock success in production or stall all unrelated tasks.

START by reading the existing files and CURRENT branch. Advance through the queue without asking questions already settled in the blueprint.
