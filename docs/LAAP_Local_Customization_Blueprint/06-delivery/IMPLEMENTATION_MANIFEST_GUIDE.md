**Feature allocation correction:** Every newly planned Studio engine, catalog, mod, theme, creator, party, marketplace, integration or licensing path belongs to **Studio/Complete only**, never Basic. Shared product/build infrastructure and existing account features may span Basic/Complete. `Flavors` values in this CSV are now enforced as `basic`, `studio`, `complete` strings. Do not compile a feature into an edition merely because some shared file is marked `all` (shared scaffolding != feature availability).

# File Manifest Usage Notes

`FILE_CREATION_MANIFEST.csv` contains **215 distinct planned source or modified paths** spanning P1–P9, with purpose, target flavor, activity and required evidence. This is the authoritative **planned file inventory**. Some listed files are already present; `Action=MODIFY` means amend rather than replace. Others are proposals; agent should adjust exact names to current conventions and document any deviations.

- **P0** has research/policy/backup tasks but no forced code file creation until gating.
- Some current files are touched more than once; the `Phase` column lists each phase and `Responsibility` concatenates relevant requirements.
- `NEW` files are specification proposals, not already implemented code; do not mark them present merely because the ZIP contains a planning row.
- Keep Rust modules slim; consider merging trivially thin files when it improves modularity while still meeting contracts. A dozen empty placeholders are not proof of completion.
- New `apps/community-api` and `apps/community-admin` belong to optional online services, **not shared Riot account mode**.
- Legacy Team backend files should be retired only after controlled migration and authorization; they intentionally remain listed in `REPO_AUDIT.md`, not all as immediate deletions.
- Required artifacts in this ZIP include actual JSON schema drafts, SQL drafts, feature/source evidence matrix, phased tasks, QA gates and agent skill files; the source files listed here are to be implemented by the coding agent.

## Traceability

Every feature should map through: **source → parity row → owner spec → target source files → test case → screenshots/native evidence**.

Example: `EX` row "Party mod transfer" → `04-features/PARTY_AND_SOCIAL.md` → `party/transfers.rs`, `TransferApproval.tsx`, `party-privacy.test.ts` → consent and malformed ZIP tests → actual room reconnection test on Windows.

Example: `WF` row `bridge_send` → classified `EXCLUDE_AS_DESCRIBED` → no corresponding implementation file → blocked/absence test and explanation in final report.
