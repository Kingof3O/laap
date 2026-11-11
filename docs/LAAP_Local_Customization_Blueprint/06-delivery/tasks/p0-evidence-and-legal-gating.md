**v2.0 SKU gate:** Review/approval groundwork for all products. Basic remains current local-account launcher without new Studio features.

# P0 — Evidence and legal gating

**Purpose:** Recheck the actual repo and source/legal claims; provide a business approval request and restore-tested migration plan. No irreversible changes.

## Required source inventory for this milestone

- No code changes mandated before evidence and approval discovery.

## Implementation protocol

1. Read root `AGENTS.md`, relevant `04-features` specs and source/legality docs.
2. Recheck latest code; implement the listed files and supporting tests with no placeholders.
3. Check actual behavior, error/offline/rollback states and platform capability boundaries.
4. Run current frontend/Rust checks, source test suites and native platform tests where available.
5. Capture screenshots of affected UI at 960×640, 1160×760 and 1440×900; fix clipping/contrast and then freeze styling once accepted.
6. Track every related `FEATURE_PARITY_MATRIX.csv` row with evidence and policy decision.
7. Deliver diff, test logs, migration/rollback and external blockers; no fake native installation claim and no production release.

## Acceptance gate

Recheck the actual repo and source/legal claims; provide a business approval request and restore-tested migration plan. No irreversible changes.

See `06-delivery/QUALITY_GATES.md` and `06-delivery/IMPLEMENTATION_PLAN.md` for exact tests and sequencing. Do not claim this milestone complete if restricted features are just mock buttons or if the relevant external permissions are missing.
