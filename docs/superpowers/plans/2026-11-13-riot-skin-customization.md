# Riot-Skin Customization Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make Rose/Wildflover-style Riot-skin customization work end-to-end: smart mod resolution, adapter backend abstraction, operation journaling, warm staging, preset→mod mapping, diagnostics, and companion/UI wiring, with user-accepted risk.

**Architecture:** Extend the existing customization module (`apps/desktop/src-tauri/src/customization`) with three new focused modules — `resolver`, `journal`, `diagnostics` — and integrate them into the existing pipeline: library → adapter → runner → bridge → UI. Preserve all existing structural safety checks (path traversal, archive bombs, executable payloads); only policy blocks around paid/preset content stay removed.

**Tech Stack:** Rust (Tauri 2), serde, zip, sha2, React + TypeScript, Playwright.

**Spec:** Conversation plan "Enhanced Plan: Rose + Wildflover Merge (v2)".

## Global Constraints
- Never reintroduce `contains_paid_riot_content` / `preset` policy rejections.
- Keep bridge bound to `127.0.0.1`, bearer-token authenticated, origin-checked.
- All new behavior behind explicit config flags or user actions; no silent activation.
- Structural archive safety checks remain.
- Python is not available; edit files with dedicated tools/shell only.

## Review Focus
- A mod targeting `champion_ids` but no matching name must still resolve correctly.
- Two conflicting enabled mods for the same champion must deterministically pick the higher-priority one.
- Journal must survive partial adapter failure and be readable after restart.
- Adapter discovery must not misidentify a shell host as a backend.
- Warm staging must never touch a live match.

---

### Task 1: Smart Mod Resolver

**Files:**
- Create: `apps/desktop/src-tauri/src/customization/resolver.rs`
- Modify: `apps/desktop/src-tauri/src/customization/mod.rs`
- Test: same file `#[cfg(test)]` module

**Interfaces:**
- Produces:
  - `pub struct ModMatch { pub sha256: String, pub display_name: String, pub champion_id: u32, pub confidence: f32, pub reason: String }`
  - `pub fn normalize_champion_name(name: &str) -> String`
  - `pub fn score_mod_for_champion(mod_name: &str, mod_id: &str, champion_ids: &[u32], champion_id: u32, champion_name: &str) -> f32`
  - `pub fn resolve_best_mod(items: &[InstalledMod], champion_id: u32, champion_name: &str) -> Option<ModMatch>`

- [x] Step 1: Write failing tests
- [x] Step 2: Run `cargo test resolver` → fail
- [x] Step 3: Implement resolver
- [x] Step 4: Re-run → pass
- [x] Step 5: Commit

### Task 2: Operation Journal

**Files:**
- Create: `apps/desktop/src-tauri/src/customization/journal.rs`
- Modify: `mod.rs`, `game_adapter.rs` (apply/restore hooks)
- Test: `#[cfg(test)]`

**Interfaces:**
- Produces:
  - `pub enum JournalAction { Validate, Stage, Activate, Restore, Defer, Fail }`
  - `pub struct JournalEntry { pub at: u64, pub action: JournalAction, pub mod_hashes: Vec<String>, pub adapter_version: Option<String>, pub game_build: Option<String>, pub detail: String }`
  - `pub fn append_at(root: &Path, entry: JournalEntry) -> Result<(), String>`
  - `pub fn read_recent_at(root: &Path, limit: usize) -> Result<Vec<JournalEntry>, String>`

- [x] Step 1: Failing test (append 3, read 2 returns newest-first, persistence after reopen)
- [x] Step 2: Run → fail
- [x] Step 3: Implement capped JSONL journal (max 256 KiB, 200 entries)
- [x] Step 4: Run → pass
- [x] Step 5: Hook into `apply_candidates_via_adapter_at` and `restore_defaults_via_adapter_at`
- [x] Step 6: Commit

### Task 3: Adapter Backend Abstraction

**Files:**
- Modify: `apps/desktop/src-tauri/src/customization/game_adapter.rs`
- Modify: `apps/desktop/src/features/customization/api.ts`
- Test: `#[cfg(test)]`

**Interfaces:**
- Produces:
  - `pub enum AdapterBackend { Cslol, Ltk, Generic }`
  - `pub fn backend_for_binary(name: &str) -> AdapterBackend`
  - `pub fn backend_capabilities(backend: &AdapterBackend) -> Vec<String>`
  - New `AdapterStatusReport` fields: `backend: AdapterBackend`, `capabilities: Vec<String>`

- [x] Step 1: Failing test for backend detection + capabilities
- [x] Step 2: Run → fail
- [x] Step 3: Implement detection by filename, populate report
- [x] Step 4: Update TS types
- [x] Step 5: Run → pass
- [x] Step 6: Commit

### Task 4: Runner Integration — Resolver, Mode Awareness, Warm Staging

**Files:**
- Modify: `apps/desktop/src-tauri/src/customization/in_game_runner.rs`
- Modify: `apps/desktop/src/features/customization/api.ts`
- Test: `#[cfg(test)]`

**Interfaces:**
- Consumes: `resolver::resolve_best_mod`, `journal::append_at`
- Produces: `pub struct WarmStageOutcome { staged: usize, at: u64 }`, `pub fn warm_stage_for_champion_at(root, champion_id, opts) -> Result<WarmStageOutcome, String>`
- New status fields: `game_mode: Option<String>`, `warm_stage_status: String`

- [x] Step 1: Failing tests for resolver-backed loadout and lobby warm staging
- [x] Step 2: Run → fail
- [x] Step 3: Replace substring matching with resolver; capture mode from LCU session; pre-stage on `Lobby|Matchmaking|ReadyCheck` when a champion is known
- [x] Step 4: Update TS types
- [x] Step 5: Run → pass
- [x] Step 6: Commit

### Task 5: Preset → Mod Mapping

**Files:**
- Modify: `apps/desktop/src-tauri/src/customization/presets.rs`
- Modify: `in_game_runner.rs`
- Modify: `apps/desktop/src/features/customization/api.ts` (Preset interface)
- Test: `#[cfg(test)]`

**Interfaces:**
- `Preset` gains `#[serde(default)] pub mod_sha256: Option<String>`
- Runner applies mapped preset mod when `mod_sha256` is a valid hash and package exists.

- [x] Step 1: Failing test for preset round-trip with mod hash + invalid hash rejection
- [x] Step 2: Run → fail
- [x] Step 3: Implement field + validation; runner honors it
- [x] Step 4: Run → pass
- [x] Step 5: Commit

### Task 6: Diagnostics & Adapter Self-Test

**Files:**
- Create: `apps/desktop/src-tauri/src/customization/diagnostics.rs`
- Modify: `mod.rs`, `lib.rs`, `api.ts`, `GameAdapterSettingsPanel.tsx`
- Test: `#[cfg(test)]`

**Interfaces:**
- Produces:
  - `pub fn build_diagnostics_at(root: &Path) -> Result<serde_json::Value, String>`
  - Tauri commands: `customization_diagnostics_bundle`, `game_adapter_self_test`
  - `self_test` runs probe + validate only (never activates) and returns per-step results.

- [x] Step 1: Failing test for diagnostics payload shape + redaction
- [x] Step 2: Run → fail
- [x] Step 3: Implement + register commands
- [x] Step 4: Add UI buttons
- [x] Step 5: Run → pass
- [x] Step 6: Commit

### Task 7: Verification

- [x] `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml resolver journal`
- [x] `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
- [x] `npx tsc --noEmit` in `apps/desktop` if available
- [x] Commit fixes
