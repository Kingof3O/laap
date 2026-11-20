# Dual-Game Support: League of Legends + VALORANT

**Date:** 2026-11-20
**Status:** Design for review
**Scope:** Desktop app (React + Tauri/Rust), local vault, Personal Roster, launch flow, OP.GG metadata

## 1. Intent

LAAP currently manages Riot accounts for League of Legends only. The Riot
session it saves is already game-neutral: the same Riot refresh token works
for League and VALORANT. The launch step is the only League-specific part.

The product goal is to let the same profile be used for League, VALORANT,
or both, without duplicating the Riot account or the saved session. The user
selects a game in the toolbar; every page then speaks in that game's terms,
and Play launches that game with the selected profile's saved Riot session.

The user's words: "app should be dealing with 2 games league and valorant",
"when user trying to add / edit accounts he can say it for league and valo
or only 1", and "at the toolbar we can put toggle button to change between
valo and league".

Riot ID, region, rank, and level for VALORANT can be read from OP.GG the
same way League rank is read today (`https://op.gg/valorant/profile/Name-Tag`).
That is the "safe info" that does not involve Vanguard.

## 2. Goals

- A profile can be marked League only, VALORANT only, or both.
- A persistent League/VALORANT toggle in the roster toolbar sets the active
  game for the whole app.
- Every roster page filters, labels, sorts, and launches according to the
  active game.
- Add/Edit Account lets the user choose the profile's games and per-game
  ranks.
- Play launches the active game with the profile's saved Riot session.
- OP.GG auto-fill and rank sync work for both games.
- Existing profiles keep working and default to League.
- League-only features are clearly scoped and never confuse a VALORANT user.
- Vanguard is never stopped, modified, or required by LAAP beyond launching
  the official Riot Client with the official VALORANT product argument.

## 3. Non-goals

- No new credential collection, password storage, or Riot login automation.
  Sign-in remains the official Riot Client.
- No VALORANT skin/mod customization. The existing Studio/customization
  system stays League-only.
- No Riot public API live-match tracking for VALORANT. There is no supported
  current-game endpoint equivalent to League's spectator API.
- No automatic VALORANT rank/RR beyond what OP.GG exposes publicly.
- No per-game duplicate profiles. One Riot account remains one profile.
- No shared/team vault work. The Team surface is retired in the active app;
  this release covers only the Personal Roster, add/edit, launch, and OP.GG.
- No change to the anti-cheat boundary: LAAP never injects into the game,
  never touches Vanguard files or services, and never reads game memory.

## 4. Confirmed product decisions

1. **One profile, one Riot account.** Games are capabilities of that profile,
   not separate profiles.
2. **Toolbar toggle drives the app.** The active game is global and
   persisted. The roster, filters, rank labels, add/edit defaults, and Play
   action follow it.
3. **Per-game rank.** A profile can hold a League rank and a VALORANT rank.
   The active game decides which one is shown, filtered, sorted, and synced.
4. **Shared session.** Sign-in, capture, refresh, backup/restore, and
   encryption are unchanged. The session blob is the same for both games.
5. **OP.GG is the metadata source.** League uses the existing OP.GG summoner
   page. VALORANT uses the OP.GG VALORANT profile page and its embedded
   profile data.
6. **Vanguard is out of scope for automation.** LAAP launches the official
   Riot Client with `--launch-product=valorant`; Vanguard starts on its own.
   LAAP only detects it and warns if VALORANT is selected and Vanguard is
   unavailable.

### 4.1 Scope note: shared/team vault (confirmed out of scope)

The user confirmed: "only personal since shared vault is retired."

The active desktop entrypoint (`apps/desktop/src/App.tsx`) renders only
`PersonalRosterView`. `TeamVaultView` and `useCloudAccounts` exist but are
not imported by the active entrypoints, and
`docs/LAAP_THREE_EDITION_IMPLEMENTATION.md` records that the Team surface
was retired while the API/admin/backend were retained for migration.

Therefore the shared vault, cloud accounts, leases, and the API/Supabase
`games` work are **not part of this release**. Sections 8.12, 10, 11.5 and
12.3 are retained only as a note for a future revival; they are not
implementation work. The release is the active Personal Roster + local
launch flow.

## 5. Decisions made by the builder (not user-confirmed)

These are sensible defaults; flag them while reviewing.

- **Toolbar placement:** the game toggle lives in `SubNavbar`, before the
  search box, as a two-segment control (League / VALORANT) with icons and
  accessible labels. The Header stays focused on app-level actions.
- **Presence is League-only in v1.** The existing LAAP Presence chat proxy
  is unverified with VALORANT/Vanguard. The presence controls are hidden in
  VALORANT mode. A follow-up can test and enable them.
- **Studio/customization is League-only.** The Studio navigation is hidden
  or disabled in VALORANT mode. If the user is inside Studio and switches to
  VALORANT, the app returns to the roster with a short notice.
- **Live match status is League-only.** The "Check Live Match" menu action
  and in-match badges are hidden in VALORANT mode.
- **Icon auto-sync is League-only.** The existing "Sync from League Client"
  section is hidden in VALORANT mode. VALORANT rank sync remains available
  through OP.GG.
- **Region is one field per profile.** VALORANT's OP.GG URL does not include
  a region path; the profile's region is still used for display and filtering.
  If a Riot account is later found to need different regions per game, a
  `valorant_region` field can be added without changing the game association.
- **Existing profiles default to League.** A missing `games` value becomes
  `["league"]` on read. Nothing is rewritten until the profile is edited.
- **VALORANT rank format has no LP/RR.** OP.GG's public profile exposes a
  competitive tier but not reliable RR. Show "Silver 3", "Ascendant 1",
  "Radiant", or "Unranked". Do not invent LP.
- **Level is informational.** OP.GG provides a VALORANT account level. Show
  it in the inspector when available; do not store it as authoritative data.

## 6. Core concepts and data model

### 6.1 Game enum

Rust (`apps/desktop/src-tauri/src/riot/mod.rs` or a new `game.rs`):

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Game { League, Valorant }
```

TypeScript (`apps/desktop/src/lib/types.ts`):

```ts
export type Game = 'league' | 'valorant'
```

Helper names: `Game::League`, `Game::Valorant`, `Game::ALL`,
`Game::label()` ("League" / "VALORANT"), `Game::launch_product()`
(`league_of_legends` / `valorant`), `Game::default_rank_label()`.

### 6.2 Local profile

`LocalAccount` gains:

```rust
#[serde(default = "default_games")]
pub games: Vec<Game>,
#[serde(default)]
pub valorant_rank: Option<String>,
#[serde(default)]
pub last_game: Option<Game>,
```

- `rank` remains the League rank. This avoids a breaking rename across the
  many existing League call sites.
- `valorant_rank` is the VALORANT rank.
- `games` always contains at least one game. `default_games()` returns
  `vec![Game::League]` for legacy records.
- `last_game` records the last game launched for this profile; `last_used_at`
  remains the timestamp. This lets the card say "Last played: VALORANT"
  without guessing.

`ProfileCustomization` gains:

```rust
#[serde(default)]
pub auto_sync_valorant_rank: bool,
```

`auto_sync_rank` stays the League rank sync. `auto_sync_icon` stays League
icon sync. `auto_sync_valorant_rank` adds VALORANT rank sync through OP.GG.

`LocalAccountSummary` and `LocalAccountFull` expose `games`,
`valorant_rank`, and `last_game`. The existing `rank` stays League.

### 6.3 Profile details (create/edit payload)

`ProfileDetails` gains:

```rust
#[serde(default = "default_games")]
pub games: Vec<Game>,
#[serde(default)]
pub valorant_rank: Option<String>,
```

Validation:
- `games` must contain 1 or 2 unique values.
- `name` 1-120 chars, region in the supported list, notes <= 2000 chars,
  ranks <= 40 chars.
- `valorant_rank` is optional and must be a supported VALORANT rank label
  when present.
- League `rank` remains optional and keeps the existing validation.

### 6.4 Game-aware helpers

- `rank_for(game) -> Option<&str>` on `LocalAccount`/summary.
- `supports(game) -> bool`.
- `display_rank(game)` returns League `rank` or `valorant_rank`.
- `set_rank(game, value)` updates the correct field.

### 6.5 Storage migration

The local vault is JSON (`vault.json` / encrypted storage). Add fields with
`#[serde(default)]`; no destructive migration. Legacy records load with
`games = ["league"]`, `valorant_rank = None`, `last_game = None`.
`auto_sync_valorant_rank = false`.

Do not rewrite the vault on app start. Rewrite naturally on the next edit or
session refresh, as the current storage layer already does for other fields.

## 7. Game context and toolbar

### 7.1 State

New `GameProvider` (`apps/desktop/src/context/GameContext.tsx`) with:
- `activeGame: Game` (default `'league'`).
- `setActiveGame(game)`.
- Persistence in `localStorage` key `laap:active-game`.
- Initial read guarded by try/catch, like `VIEW_MODE_KEY`.
- A `laap:game-change` window event for components that do not consume the
  context (tray, live status, etc.).

### 7.2 Toolbar toggle

`SubNavbar` gets:
- `activeGame`, `onGameChange`.
- A segmented control rendered before the search box:
  - League button with a sword/summoner icon.
  - VALORANT button with a crosshair/V icon.
  - `aria-pressed`, `role="group"`, `aria-label="Active game"`.
  - Styled with the existing gold/blue design tokens; active segment filled.
- On change:
  - Reset rank filter to `all` (the rank list changes by game).
  - Keep region, search, favorites, sort, and view mode.
  - The roster filters to the new game immediately.
  - If the new game has no profiles, show the game-specific empty state with
    an "Add VALORANT profile" / "Add League profile" action.

### 7.3 Counts and labels

- `totalCount` is the count of profiles supporting the active game.
- The add button label becomes "Add League Profile" / "Add VALORANT Profile"
  (or keeps "Add Profile" with the game preselected; choose one and be
  consistent).
- The empty state title/body names the active game.
- The roster heading kicker can include the game: "YOUR LEAGUE ACCOUNTS" /
  "YOUR VALORANT ACCOUNTS". Use the existing "YOUR ACCOUNTS" for a neutral
  fallback.

## 8. Page-by-page behavior

### 8.1 Header

- No game toggle here; it stays in `SubNavbar`.
- `Stop Riot`, `Refresh`, settings, billing, presence, and update controls
  remain global.
- `PresenceSelect` is hidden in VALORANT mode (see 8.10).
- The running indicator is global: any Riot Client/game counts.
- Do not change the brand.

### 8.2 SubNavbar

Covered in section 7. Additional rules:
- Rank filter options are built from the active game's rank field across
  profiles supporting that game.
- Sort options "Rank (High to Low/Low to High)" use the active game's rank.
- The existing "No rank set" option means "no rank for the active game".
- Search matches name, region, active-game rank, RIOT ID, and notes.
- Reset clears search/region/rank/favorites/sort but does not change the
  active game.

### 8.3 Personal roster (grid + list)

- Filter: `profile.games.includes(activeGame)`.
- Card rank: `rank_for(activeGame)`.
- Card badges: show small game chips for the profile's games. A both-games
  profile shows both; a single-game profile shows one. In VALORANT mode the
  card's primary rank is the VALORANT rank.
- Play label: "Play" in both modes (keep it simple), or "Play League" /
  "Play VALORANT" when the profile supports both. Prefer "Play" plus the
  active game shown in the toolbar; the launch status message names the game.
- Launch state:
  - `launchAccount(id)` becomes `launchAccount(id, activeGame)`.
  - The native command receives the game.
  - `activeLaunchKey` includes the game: `local:${id}:${game}`; the tray
    active-id logic must strip the game suffix or use a separate `active_id`.
- Empty state:
  - No profiles at all: existing onboarding.
  - Profiles exist but none for the active game: "No VALORANT profiles yet"
    with an Add action; a secondary link "Switch to League" (and vice versa).
- Favorites count and total count reflect the active game.
- List view (`AccountListTable`) shows the active-game rank and game badges.

### 8.4 Add Account modal

New "Games" section above the name fields:
- Two checkboxes/toggle chips: League, VALORANT.
- At least one must stay checked. Unchecking the last one is disabled with a
  short message.
- Default: the active game is checked. If the active game is League, League
  is checked; the user can add VALORANT.
- The label explains: "The same Riot login works for both games."
- For a both-games profile, show two rank fields:
  - "League rank (optional)" with the existing League rank picker.
  - "VALORANT rank (optional)" with a new VALORANT rank picker.
- If only League is selected, hide the VALORANT rank field and do not submit
  it. If only VALORANT is selected, hide the League rank field. In Edit, the
  previously saved rank for an unchecked game is preserved (hidden), not
  erased.
- The "Import Current Session" path uses the same Games section. It still
  reads the existing Riot session; the game choice only labels the profile.
- Sign-in path:
  - Launch Riot Client with the active/selected game product. If both games
    are selected, use the active toolbar game as the sign-in product.
  - Show "Signing in for League" / "Signing in for VALORANT" in the modal.
  - The session capture is unchanged.
- Auto-detect details from the session: Riot ID, region, PUUID. The same
  detection works for both games.
- The preview badge shows the profile's games.
- Validation/save: pass `games` and `valorant_rank` through
  `start_provisioning_session` / `complete_local_provisioning` /
  `save_local_account` (or the existing details payload).
- **After save, the profile must not appear to vanish.** If the saved
  profile supports the active game, stay on the current roster. If it does
  not (for example the user added a VALORANT-only profile while League is
  active), automatically switch the active game to the profile's first game
  and show a toast: "Switched to VALORANT to show this profile." This is a
  builder's call; the important part is that the user sees where the profile
  went.

### 8.5 Edit Account modal

- Same Games section as Add.
- Show/hide per-game rank fields.
- Changing games:
  - Adding a game is always allowed (subject to Basic profile-slot rules).
  - Removing a game is allowed when the profile is not currently launched.
    If it is, disable the change with a message: "Stop the running client
    before changing this profile's games."
  - Removing a game keeps its saved rank value hidden, so re-adding restores
    it. The UI must not show the hidden rank in filters or cards.
  - If the edit removes the active game, switch the active game to the
    profile's remaining game after save and show a toast, so the profile
    does not appear to vanish from the roster.
- The League-only "Customization & Client Sync" panel:
  - In League mode, unchanged.
  - In VALORANT mode, hide the icon/League sync section and show a short
    "Customization is League-only" note if the profile supports League.
  - The VALORANT rank auto-sync checkbox appears in the rank area.
- The footer hint changes to "Your saved Riot login stays unchanged."

### 8.6 Profile inspector

- Shows the active game's rank and the correct OP.GG link.
- League: `https://op.gg/lol/summoners/{region}/{name}-{tag}`.
- VALORANT: `https://op.gg/valorant/profile/{name}-{tag}`.
- The "Sync OP.GG" button fetches the active game's stats.
- The "View on OP.GG" button opens the active game's URL.
- Auto-sync of the displayed rank updates the active game's rank field.
- VALORANT inspector may show:
  - Rank (e.g. "Silver 3").
  - Level (e.g. "Level 286") when OP.GG provides it.
  - Region as returned by OP.GG, with a small mismatch note if it differs
    from the profile region.
- Live match card/status is hidden in VALORANT mode.
- The inspector's edit/launch buttons use the active game.

### 8.7 Rank pickers

- League rank picker: existing `RankPicker` values (Iron IV..Challenger).
- VALORANT rank picker: separate list:
  - Unranked, Iron 1-3, Bronze 1-3, Silver 1-3, Gold 1-3, Platinum 1-3,
    Diamond 1-3, Ascendant 1-3, Immortal 1-3, Radiant.
- Filters use the active game's picker list plus values already saved on
  profiles (so custom/legacy labels still appear).
- Sorting: define a rank order for VALORANT (Unranked < Iron 1 < ... <
  Radiant) and use it for "Rank High/Low". League keeps its existing order.

### 8.8 OP.GG integration

Rust `apps/desktop/src-tauri/src/opgg.rs`:
- Add `Game` parameter to `fetch_opgg_summoner` and
  `fetch_opgg_summoner_stats`.
- League URL is unchanged.
- VALORANT URL:
  `https://op.gg/valorant/profile/{urlencoding_simple(name)}-{urlencoding_simple(tag)}`
  (no region segment).
- VALORANT parsing:
  - The page is a Next.js/RSC document. Read the embedded `profile` object
    (the HTML contains escaped JSON; unescape `\"` before parsing).
  - Fields: `gameName`, `tagLine`, `level`, `region`, `competitiveTier`,
    `queueId`, `platform`, `rank`, `lastUpdatedAt`, `tierHistories`.
  - `competitiveTier` map (verified against OP.GG's live tier table on
    2026-11-20):
    0 Unranked; 3 Iron I; 4 Iron II; 5 Iron III; 6 Bronze I; 7 Bronze II;
    8 Bronze III; 9 Silver I; 10 Silver II; 11 Silver III; 12 Gold I;
    13 Gold II; 14 Gold III; 15 Platinum I; 16 Platinum II; 17 Platinum III;
    18 Diamond I; 19 Diamond II; 20 Diamond III; 21 Ascendant I;
    22 Ascendant II; 23 Ascendant III; 24 Immortal I; 25 Immortal II;
    26 Immortal III; 27 Radiant. IDs 1 and 2 are unused and must render as
    "Unranked" rather than an unknown tier.
  - Format: "Silver 3", "Ascendant 1", "Radiant", "Unranked". No LP.
  - Ignore `rank: null` as RR (it is not reliable); do not show a fake RR.
  - Test the boundaries explicitly: 0, 3, 26, 27, and an unknown 1/2/28.
- Keep the existing `SummonerProfile` shape where practical, adding:
  - `game: Game`
  - `level: Option<u32>`
  - `formatted_rank` for the active game
  - `opgg_url` for the active game.
- If the embedded profile cannot be parsed, return a clear error and keep the
  saved rank. Do not fall back to the generic meta description (it says only
  "Search results for ..." and contains no rank).
- **Identity check:** the VALORANT `profile` object includes `puuid`. When
  the saved profile already has a `puuid` and OP.GG returns one, they must
  match before an automatic rank write. On mismatch, skip the write and
  report "OP.GG returned a different Riot account; saved rank kept." If
  either side is missing, allow a user-initiated inspector fetch but skip
  background auto-sync (the same conservative rule the League sync uses).
- Add unit tests with a small sanitized HTML fixture containing the escaped
  profile JSON, plus map-boundary tests for tier 0/3/26/27 and the unused
  1/2 IDs.

TypeScript `apps/desktop/src/lib/opgg.ts`:
- `Game` parameter in `getOpggSummonerUrl`, `fetchOpggStats`,
  `autoSyncAccountRank`, `openOpggProfile`.
- Cache key includes the game.
- `OpggStats` adds `game`, `level`.
- The inspector passes the active game.
- `autoSyncAccountRank` calls `update_account_rank` with `{ id, game, rank }`.

### 8.9 Rank sync loop

Native `profile_assets.rs`:
- `sync_profile_customizations` iterates accounts and their supported games.
- League rank sync:
  - If League Client is available, keep the existing LCU read and identity
    check.
  - Otherwise, keep the existing OP.GG fallback.
- VALORANT rank sync:
  - Fetch OP.GG VALORANT profile for each account with
    `auto_sync_valorant_rank`.
  - Update only `valorant_rank`.
  - Never touch League rank or the icon.
- Add a per-account/per-game cooldown (default 10 minutes) or reuse the
  OP.GG cache. The current 20-second UI poll must not hammer OP.GG.
- Show sync messages that name the game: "VALORANT ranks synced from OP.GG."
- A failure for one game must not block the other or clear saved data.
- Do not sync a game the profile does not support.

### 8.10 Presence and settings

- Presence controls are hidden in VALORANT mode (builder's call in section 5).
- The launcher settings file is unchanged.
- If presence is enabled and the user launches VALORANT, do not inject
  `--client-config-url`; launch the plain VALORANT product.
- The Presence banner must not claim presence is active for a VALORANT launch.
- A "Presence is League-only" note appears in Settings when VALORANT is
  active.

### 8.11 Live status

- Hide the "Check Live Match" menu action and in-match badges in VALORANT
  mode.
- `LiveStatusSettingsCard` remains available in settings but is labeled
  "League only".
- Do not call League live endpoints with a VALORANT profile.
- The live-match confirmation modal remains global (it protects any running
  match, including VALORANT, via process detection).

### 8.12 Team vault / shared accounts (out of scope)

The shared vault is retired and not imported by the active entrypoint
(`App.tsx` renders only `PersonalRosterView`). The user confirmed it is not
part of this release. Do not change `TeamVaultView`, `useCloudAccounts`,
`SyncAccountModal`, `ActiveLeaseBanner`, the API account routes, the
Supabase adapters, or the lease schema for this project. Section 10 is a
future-revival note only.

### 8.13 Tray menu

- The tray snapshot includes `active_game`.
- The "Switch account" list shows profiles supporting the active game, with
  the game name in the label or submenu header.
- `switch_account` intent includes `game` (or the native code uses the
  snapshot's active game).
- The tray's "Stop Riot" remains global.
- Presence items remain visible but are disabled in VALORANT mode with a
  "League only" label.
- If the active game changes in the app, the tray refreshes within its 2s
  poll and shows the new list.
- `active_id` in the snapshot must be the bare account id, not the
  `local:id:game` launch key; adjust `useTrayActions` accordingly.

### 8.14 Studio / customization (League-only)

- `Studio` navigation is hidden/disabled in VALORANT mode.
- If the user is in a Studio route and switches games, navigate to the
  roster and show a toast: "Studio is available for League of Legends only."
- `GameAdapterSettingsPanel`, `ClientStatusPage`, `DoctorPage`, skin catalog,
  mod tools, and party features stay League-only. Do not attempt to adapt
  them to VALORANT in this project.
- `ProfileFields` hides the League icon/sync panel in VALORANT mode.
- The `customization` data stays on the profile even for VALORANT-only
  profiles (so it is not lost if the profile becomes League again), but it is
  not shown or synced while VALORANT is active.

### 8.15 Admin app / docs

- The admin app (`apps/admin`) is billing/customers only and is not touched.
- No API route, validation, or database changes are part of this release.
  Do not update `docs/API.md` for `games`; the API stays League/team-only
  and retired.
- Update `docs/ARCHITECTURE.md`, `docs/ANTI_BAN_VERIFICATION.md`,
  `README.md`, and `CHANGELOG.md` with the dual-game behavior and the
  Vanguard boundary.
- Update `CONTRIBUTING.md` if new module boundaries are introduced (for
  example a `game.rs`).

## 9. Native launch path

### 9.1 Launch arguments

Replace `LEAGUE_LAUNCH_ARGS` in `apps/desktop/src-tauri/src/commands/session.rs`
with:

```rust
pub fn launch_args(game: Game) -> [&'static str; 2] {
    match game {
        Game::League => ["--launch-product=league_of_legends", "--launch-patchline=live"],
        Game::Valorant => ["--launch-product=valorant", "--launch-patchline=live"],
    }
}
```

Keep `LEAGUE_LAUNCH_ARGS` only if external code/tests reference it; otherwise
remove it. Add a test that the VALORANT args are exactly the official product
and patchline and contain no secrets.

### 9.2 LaunchPlan and commands

`LaunchPlan` (`presence.rs`) gains a `game: Game` field:
- `LaunchPlan::prepare(game)`.
- `launch()` uses `launch_args(self.game)`.
- Presence identity is only created for League. For VALORANT, set
  `identity = None` and do not pass `--client-config-url`.
- The "Use Switch Account or Stop Riot before starting a presence-enabled
  client" guard remains for League. For VALORANT, the normal
  `is_riot_running` guard applies.

Command changes:
- `start_provisioning_session(confirmed, profile_id, game)`.
- `switch_account_session(session_yaml, confirmed, owner_id, game)`.
- `launch_local_account(id, confirmed, game)`.
- `launch_local(id, confirmed, game)`.
- `launch_riot_client()` stays plain (no product).
- `restart_riot_presence` stays League-only.
- `close_riot_client` stays global and never stops Vanguard.
- `runtime_snapshot` gains `vanguard` (see 9.4).

`launch_local` and `switch_session_unlocked` pass the game to the launch
plan. `switch_session_unlocked` also records `last_game` on the profile
(for local launches; for external/cloud launches the desktop can update its
local copy if it has one).

### 9.3 Session injection

Unchanged. `RiotSessionManager::inject_session`, backup/restore, owner marker,
and cleanup operate on Riot Client settings files that are shared by both
games. No game-specific session format exists.

### 9.4 Vanguard and process handling

`RuntimeSnapshot` (`riot/process.rs`) gains:
- `vanguard: bool` for `vgc.exe` (Vanguard service process).
- `valorant_game` already exists for `VALORANT-Win64-Shipping.exe`.

Rules:
- `running()` must include `vanguard` only if it is useful for the UI. Do not
  treat Vanguard as "Riot is running" for launch blocking: Vanguard runs on
  many machines all the time, and blocking launches would be wrong. Keep
  `running()` as Riot Client / League Client / game processes.
- `stop_riot` must never target `vgc.exe` or any Vanguard service/driver.
  Add a test with a `vgc.exe` process name to prove it is not a stop target.
- For a VALORANT launch, if `vanguard` is false, show a non-blocking warning:
  "Vanguard does not appear to be running. VALORANT may start it automatically;
  if the game does not open, check the Riot Client."
- If the user is on macOS, Vanguard is not present; do not show the warning
  for unsupported platforms. The launch may still be unsupported by Riot on
  that configuration; surface the Riot Client's own error.
- `guard_match` remains `league_game || valorant_game`.
- `close_riot_client` stops Riot/game processes, preserves saved logins, and
  leaves Vanguard alone.

### 9.5 Launch tracking

`RiotOperations.tsx`:
- `run` options gain `{ game: Game }`.
- The tracking loop:
  - League: wait for `league_client || league_game`; messages say "League
    Client".
  - VALORANT: wait for `valorant_game`; messages say "VALORANT".
  - Both: the Riot Client may appear first; show "Riot Client detected ·
    waiting for VALORANT…".
- The 2-minute timeout message names the active game.
- `activeLaunchKey` includes the game (`local:${id}:${game}`).
- The global "Client running" disabled state remains based on
  `operations.running`, not the game.
- The launch status banner says which game is launching.

### 9.6 Provisioning

- `start_provisioning_session` receives the game and launches the Riot Client
  with that game's product for the sign-in.
- The sandbox capture, restore, and cancellation logic is unchanged.
- `complete_local_provisioning` receives `details` including `games` and
  `valorant_rank`.
- `profile_id` refresh (`refresh_session`) is unchanged: the same Riot
  account must sign in again, and the games remain as edited.
- If the user cancels, the original session files are restored as today.

## 10. API and cloud data (out of scope)

The shared vault and its API are retired and confirmed out of scope. Do not
change the API routes, validation package, SQLite/Supabase adapters, lease
schema, seed data, admin service, or `docs/API.md` for this release.

If the shared vault is ever revived, carry these two findings forward:
- Do not derive `accountUpdateSchema` from `accountCreateSchema.partial()`
  when the create schema has a `.default(['league'])`. Zod keeps the default
  on the partial schema, so a PATCH containing only `displayName` would
  reset a VALORANT or both-games account to League. Use an explicit optional
  `games` field for updates.
- Update both SQLite and Supabase adapters, and add a way for admins to set
  games on cloud accounts. There is no account editor in the active Team
  Vault UI today, so otherwise VALORANT cloud accounts can only come from
  the seed or direct API calls.

## 11. Edge cases and failure modes

### 11.1 Profile and games
- Legacy profile with no `games` -> League only.
- Empty `games` from an older client -> reject with a clear message; do not
  silently save.
- Duplicate games in the array -> deduplicate on save.
- Both games selected but only one rank set -> the other shows "No rank
  set"; Play still works.
- A profile's games changed while a client is running -> block until stopped.
- Removing a game hides its rank from cards/filters but preserves the value.
- A profile with no session -> "Sign in required" regardless of game.

### 11.2 Sign-in
- Sign-in for VALORANT launches the Riot Client with the VALORANT product;
  if Vanguard is missing, the Riot Client shows its own error.
- Sign-in for a both-games profile uses the active game's product.
- Cancel restores the original settings for both games.
- Import Current Session works even if the user signed in through the other
  game's client; the Riot session is shared.
- Duplicate PUUID detection is unchanged and blocks saving the same Riot
  account twice, even if the games differ.
- Basic flavor slot limits are per profile, not per game. Two active profiles
  can be League-only, VALORANT-only, or both.

### 11.3 Launch
- VALORANT-only profile is not shown in League mode, and vice versa.
- Both-games profile launches the active game.
- If Riot is already running, the existing native guard returns an error;
  the UI shows the existing message. Do not start a second client.
- Live match guard: if a League or VALORANT match is running, ask for
  confirmation before stopping.
- If VALORANT is selected but the Riot Client does not expose the product
  (installation issue), surface the error and do not claim success.
- If Vanguard is not running, warn but still try the official launch.
- If the Riot Client is running as Administrator and LAAP is not, the
  existing elevated-shutdown guidance applies.
- Stop Riot preserves both games' saved logins and never stops Vanguard.
- The launch cooldown and operation lock apply to both games.
- Tray launch uses the active game; if the tray is stale, the native command
  validates the game and the profile's support.

### 11.4 OP.GG
- Account not found on OP.GG: show "Not found on OP.GG" and keep the saved
  rank; do not clear it.
- Private/hidden rank: show "Unranked/Unavailable" and keep the saved rank.
- OP.GG HTML/JSON changes: parser returns an error; the UI shows the error
  and keeps saved data. Add a fixture-based test so changes are detected.
- Name/tag with spaces or special characters: URL-encode each part; keep the
  hyphen separator.
- A Riot ID with no `#tag`: use the region as the tag fallback, as League
  does today; for VALORANT, the OP.GG URL requires a tag, so show "Link a
  Riot ID with #TAG" instead of querying a dummy profile.
- Region mismatch: OP.GG's profile region is informational; do not overwrite
  the profile region automatically.
- Rate limits: use the existing 5-minute frontend cache and add a native
  cooldown for background sync; never retry in a tight loop.
- The embedded `profile` JSON may be absent on 404/blocked pages: detect and
  fail gracefully.
- Valorant tier 0 (Unranked), tier 3 (Iron 1), tier 26 (Immortal 3), and
  tier 27 (Radiant) boundaries: test them, plus the unused IDs 1/2.
- Level missing: omit it; do not show 0.

### 11.5 Team vault (out of scope)

The shared vault is retired and excluded from this release. There are no
cloud-account, lease, or API edge cases to handle in this project.

### 11.6 UI/accessibility
- Toggle is keyboard reachable; `aria-pressed` reflects the active game.
- Game badges have text labels, not color alone.
- Empty states name the game and offer the correct Add action.
- Rank filter resets when the game changes; no stale `rank:` value survives.
- Searching in VALORANT mode does not match League ranks; it matches the
  active game's rank.
- The inspector closes or refreshes correctly when the active game changes,
  so it does not show the other game's OP.GG link.
- The roster selection (selected card) is preserved if the profile supports
  the new game; otherwise select the first visible profile.
- Offline/Basic: game toggle works; cloud-only features remain hidden.

### 11.7 Security and anti-cheat
- No new credentials are stored. The session blob remains the same Riot
  token, encrypted at rest as today.
- OP.GG requests are public, unauthenticated HTTPS requests. No Riot API key
  is used for VALORANT metadata.
- Vanguard is never read, written, stopped, or bypassed. LAAP does not inject
  into VALORANT or modify game files.
- The presence proxy is not used for VALORANT in v1 (builder's call).
- Do not add VALORANT-specific endpoints that require undocumented Riot
  auth tokens.
- The existing security model docs (`docs/SECURITY_MODEL.md`) get a note
  that VALORANT support uses the same official Riot Client launch path and
  OP.GG public pages only.

## 12. Testing plan

### 12.1 Rust unit tests
- `Game` serde round-trip and launch args for both games.
- `launch_args(Game::Valorant)` is exactly
  `["--launch-product=valorant", "--launch-patchline=live"]`.
- Legacy `LocalAccount` JSON without `games` loads as League.
- `ProfileDetails` rejects empty/duplicate games.
- `rank_for` and `set_rank` update the correct field.
- `edit_profile` preserves hidden ranks and blocks invalid game changes.
- `refresh_session` keeps games and per-game ranks.
- VALORANT OP.GG parser: fixture with escaped profile JSON, tier boundaries
  (0, 3, 26, 27, unused 1/2, unknown 28), missing level, missing profile
  object, and a PUUID mismatch.
- Background VALORANT rank sync skips the write when OP.GG's PUUID differs
  from the saved profile's PUUID.
- `stop_riot` does not include `vgc.exe` targets.
- `runtime_snapshot` detects `VALORANT-Win64-Shipping.exe`.
- Sync loop updates only VALORANT rank for a VALORANT-only account and does
  not touch League rank/icon.

### 12.2 TypeScript/React tests
- `GameContext` persists and restores the active game.
- `SubNavbar` toggle calls `onGameChange` and exposes `aria-pressed`.
- Roster filters by active game; counts and empty states update.
- Rank options/filters switch with the game.
- Add/Edit modal:
  - active game preselected,
  - cannot uncheck the last game,
  - per-game rank fields show/hide,
  - save payload includes games and valorant rank,
  - edit blocks game removal while the profile is busy/launched,
  - saving a profile that does not support the active game switches the
    active game and shows the toast, so the profile does not vanish.
- Account card shows the active game's rank and game badges.
- Inspector uses the correct OP.GG URL and hides live status in VALORANT
  mode.
- `AccountListTable` shows the active game's rank.
- Tray snapshot includes the active game and the bare active id.
- Existing desktop UI tests' `runtime_snapshot` fixtures gain `vanguard`.

### 12.3 API tests (out of scope)

No API tests are added or changed. The shared vault and API are retired and
excluded from this release.

### 12.4 E2E / manual matrix
- Two Windows machines (or VMs) with Riot Client + League + VALORANT.
- Add League-only, VALORANT-only, and both profiles via sign-in and import.
- Launch each from the roster in both toolbar modes.
- Verify the Riot Client product argument in the process command line (or
  via the client's launched game) for a VALORANT launch.
- Verify a VALORANT launch with Vanguard running and with Vanguard stopped.
- Verify "Stop Riot" leaves Vanguard running and preserves both sessions.
- Verify a League sign-in followed by a VALORANT launch with the same profile
  (and vice versa) works without re-entering credentials.
- Verify OP.GG rank/level for a public VALORANT profile and a private/404
  profile.
- Verify Basic two-slot limits with mixed games.
- Verify the tray switch-account list in both modes.
- Verify no League-only Studio/live/presence controls appear in VALORANT
  mode.

## 13. Implementation order

1. **Foundation**
   - Add `Game`, games/valorant rank fields, serde defaults, validation,
     migration behavior.
   - Launch args + `LaunchPlan(game)` + command signatures + `runtime_snapshot`
     vanguard.
   - Rust tests.
2. **Roster context**
   - `GameContext`, toolbar toggle, persistence.
   - Filtering, counts, rank options, empty states, cards/list/inspector
     game-awareness.
   - Launch tracking.
3. **Add/Edit**
   - Games section, per-game rank pickers, per-game sync toggles, validation,
     edit guardrails.
4. **OP.GG**
   - VALORANT URL/parser, frontend game parameter, inspector stats, rank sync
     cooldown and tests.
5. **League-only gating**
   - Hide Studio/live/presence/icon sync in VALORANT mode.
   - Redirect/notice behavior.
6. **Tray + docs + polish**
   - Tray active game, labels, bare active id.
   - Docs and changelog.
   - Full test pass and manual matrix.

## 14. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| VALORANT launch arg is wrong or changes | Keep it in one function, test it, surface the Riot Client's own error. |
| Vanguard blocks or dislikes a launch path | Use the official Riot Client product launch only; no injection, no presence proxy in v1; never touch Vanguard. |
| OP.GG changes its VALORANT page | Fixture-based parser tests; fail gracefully and keep saved ranks. |
| OP.GG rate limits background sync | Per-account/per-game cooldown + frontend cache; no tight retries. |
| Per-game ranks confuse the UI | Active-game context + explicit "League rank"/"VALORANT rank" labels; reset rank filter on game change. |
| Legacy profiles break | Serde defaults to League; tests for old vault JSON. |
| Presence is expected in VALORANT | Explicitly label it League-only in v1; follow-up testing can enable it. |
| Studio users lose access | Studio stays visible in League mode; VALORANT mode shows a clear notice and returns to roster. |

## 15. Acceptance criteria

- A new user can toggle League/VALORANT in the toolbar, add a profile for
  either or both, and see only relevant profiles.
- A both-games profile shows the active game's rank and launches the active
  game with the saved Riot session.
- A VALORANT-only profile cannot be launched from League mode (and vice
  versa).
- Add/Edit requires at least one game and stores per-game ranks.
- OP.GG auto-fill works for both games; VALORANT shows rank/level from the
  public profile and handles not-found/private gracefully.
- Existing League-only profiles continue to work with no user action.
- Vanguard is never stopped or modified; VALORANT uses the official Riot
  Client launch.
- League-only Studio, live status, presence, and icon sync are not shown as
  usable in VALORANT mode.
- Tests from section 12 pass; manual matrix from 12.4 is verified on Windows.

## 16. Open questions for the user

The shared-vault scope is settled: out of scope. Remaining minor choices:

1. Should the toggle also change the visual theme/accent (League gold vs
   VALORANT red), or only the data/actions? (Builder default: data/actions
   only; theme stays LAAP.)
2. For a both-games profile, should the inspector show both OP.GG stats at
   once or only the active game's? (Builder default: active game only, with
   a small "Switch game to see the other rank" note.)
3. Should the Add button label include the game ("Add VALORANT Profile") or
   stay "Add Profile" with the game preselected? (Builder default: include
   the game for clarity.)
4. Is it acceptable that VALORANT rank has no LP/RR (OP.GG public data), or
   is RR required? (Builder default: tier only.)
5. Should presence eventually be enabled for VALORANT, or is League-only
   acceptable for this release? (Builder default: League-only in v1.)

The OP.GG tier map is no longer open: it was verified against the live
tier table and corrected to `0, 3-27` in section 8.8.
