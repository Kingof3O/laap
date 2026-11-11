-- DESIGN DRAFT ONLY: never apply to production without migration review.
-- Isolated customization DB. Absolutely NO Riot session blobs, client credentials,
-- Team leases, PUUID, keychain secrets or remote auth tokens stored here.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS library_assets (
  sha256 TEXT PRIMARY KEY CHECK(length(sha256) = 64),
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  detected_mime TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('user_import','approved_catalog','creator_export')),
  storage_key TEXT NOT NULL UNIQUE,
  declared_license TEXT,
  author TEXT,
  rights_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(rights_review_status IN ('pending','approved','rejected','revoked')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mod_packages (
  mod_id TEXT NOT NULL,
  version TEXT NOT NULL,
  content_sha256 TEXT NOT NULL REFERENCES library_assets(sha256),
  display_name TEXT NOT NULL,
  champion_ids_json TEXT NOT NULL DEFAULT '[]',
  categories_json TEXT NOT NULL DEFAULT '[]',
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  compatibility_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK(status IN ('quarantined','validated','incompatible','installed','disabled','revoked')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mod_id, version)
);
CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  -- local_account_id is an opaque reference ONLY, no Riot identity or session.
  local_account_id TEXT,
  champion_id INTEGER,
  queue_mode TEXT,
  body_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS theme_projects (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  body_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS operation_journal (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('started','staged','committed','rolled_back')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_mods_status ON mod_packages(status);
CREATE INDEX IF NOT EXISTS idx_presets_account_champion ON presets(local_account_id, champion_id);
PRAGMA user_version = 1;
