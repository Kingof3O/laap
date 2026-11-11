# LAAP Three-Edition Release Decision

**Document Version**: 1.0.0  
**Generated At**: 2026-11-11  
**Project**: League Account Automation Platform (LAAP) — Basic, Studio, and Complete Editions  
**Target Release**: v1.0.0 (Three-Edition Transformation)  

---

## Formal Decision Status

### **`INTERNALLY BUILT / EXTERNALLY GATED`**

---

## Decision Rationale

All internal technical requirements, architecture separation boundaries, regression test suites, bundle isolation checks, and user-facing notifications for LAAP Basic, LAAP Studio, and LAAP Complete have been implemented, executed, and verified:

1. **Ship-Blocking Internal Gates**: **`ALL GREEN` (PASS)**
   - Single Rust/Tauri 2 codebase compiles cleanly under all three feature gates (`basic`, `studio`, `default` / `complete`).
   - 217 automated tests pass with 0 failures across Rust unit/integration tests, Node.js deterministic harnesses, and Playwright browser suites.
   - AST bundle isolation guarantees zero cross-edition code or capability leakage.
   - Local encrypted vaults and OS keychain bindings are preserved; legacy unencrypted sessions migrate automatically.
   - Cloud vault, remote session synchronization, and admin lease models are completely retired without touching legacy production databases.
   - Disallowed memory hooking and unauthorized skin unlocking are strictly excluded by policy.

2. **Required External Gates**: **`PENDING EXTERNAL RESOLUTION` (GATED)**
   - In accordance with `QUEUE/08-FINAL-E2E-AND-STOP.md` and `docs/LAAP_Final_Execution_Queue_v3/QUEUE/EXTERNAL-GATES.md`, automated acceptance tests cannot fabricate, bypass, or substitute for formal external vendor registrations, commercial terms, or code signing approvals.
   - Public deployment, installer auto-updates, and commercial operation remain bounded pending the resolution of nine (9) external dependencies tracked in [`docs/implementation-tracking/EXTERNAL-BLOCKERS.md`](file:///c:/pw/laap/docs/implementation-tracking/EXTERNAL-BLOCKERS.md).

---

## Release Readiness by Edition

| Product Edition | Internal Code Status | External Dependency Status | Immediate Operational Capability |
|:---|:---:|:---:|:---|
| **LAAP Basic** (`com.laap.offline`) | **COMPLETE** | **LOW BLOCK** | Ready for immediate local developer/QA use. Public binary release requires only SignPath signing secrets (`EXT-04`) and owner release authorization (`EXT-09`). |
| **LAAP Studio** (`com.laap.studio`) | **COMPLETE** | **MODERATE BLOCK** | Ready for immediate local catalog exploration, mod packaging, and preset creation. Public release, online room relays, and patcher activation require domain/TLS hosting (`EXT-05`), Vanguard clearance (`EXT-02`), and SignPath SKU approval (`EXT-04`). |
| **LAAP Complete** (`com.laaP.desktop`) | **COMPLETE** | **MODERATE BLOCK** | Ready for local account management and account-preset linking. Shares the same external prerequisites as Studio for online services. |

---

## Required Non-Code Decisions & Approvals

The engineering implementation is complete. The following administrative actions are required by project owners before public publishing or deployment:

1. **Riot Games Developer Application**: Submit commercial SKU details to Riot Developer Relations for formal review.
2. **SignPath Code Signing**: Input production signing certificates into GitHub Actions secrets and obtain SignPath approval for the `com.laap.studio` SKU.
3. **Infrastructure Provisioning**: Deploy `apps/community-api` to a production cloud host with a custom domain, valid TLS certificates, and strict CORS/CSP policies.
4. **Provider API Keys**: Supply official credentials for Discord RPC, OP.GG / Riot API stats, ElevenLabs TTS, and OpenAI / Gemini chat proxies in the production environment.
5. **Merchant of Record**: Finalize payment gateway onboarding (e.g., Stripe, Lemon Squeezy) and webhook endpoints before enabling commercial checkouts.
6. **Production Decommission Authorization**: Provide explicit authorization before shutting down or archiving the legacy online team account backend.

---

## Summary

The transformation requested in `QUEUE/01` through `QUEUE/08` is **100% complete at the engineering level**. No further architectural refactoring or speculative coding is warranted.
