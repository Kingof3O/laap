-- DESIGN DRAFT ONLY. Separate cloud community service, NOT a copy of legacy Team API.
-- NO Riot account session_blob, encrypted local vault, shared accounts, user PUUID,
-- LCU auth tokens or device-bound game credentials permitted in this schema.
CREATE TABLE IF NOT EXISTS creator_profiles (
 id uuid PRIMARY KEY,
 display_name varchar(120) NOT NULL,
 status varchar(24) NOT NULL CHECK(status IN ('pending','active','suspended')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_mod_submissions (
 id uuid PRIMARY KEY,
 creator_id uuid NOT NULL REFERENCES creator_profiles(id),
 object_sha256 char(64) NOT NULL,
 display_name varchar(160) NOT NULL,
 declared_license varchar(80) NOT NULL,
 rights_attestation jsonb NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 moderation_status varchar(30) NOT NULL CHECK(moderation_status IN ('quarantine','under_review','approved','rejected','removed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(creator_id, object_sha256)
);
CREATE TABLE IF NOT EXISTS room_sessions (
 id uuid PRIMARY KEY,
 room_epoch bigint NOT NULL DEFAULT 1,
 ephemeral_hash char(64) NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS room_members (
 room_id uuid NOT NULL REFERENCES room_sessions(id) ON DELETE CASCADE,
 member_id uuid NOT NULL,
 public_nickname varchar(60) NOT NULL,
 last_sequence bigint NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(room_id,member_id)
);
CREATE TABLE IF NOT EXISTS moderation_reports (
 id uuid PRIMARY KEY,
 submission_id uuid REFERENCES community_mod_submissions(id),
 reason varchar(64) NOT NULL,
 details text,
 status varchar(24) NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS entitlement_grants (
 grant_id uuid PRIMARY KEY,
 commerce_subject_id uuid NOT NULL,
 sku varchar(32) NOT NULL,
 entitlement jsonb NOT NULL,
 expires_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Add RLS, service auth, retention policies, migrations and indexes after design approval.
