import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'
import type { Database as SqlDatabase } from 'sql.js'

const require = createRequire(import.meta.url)
const sqlJsPackageDir = path.dirname(require.resolve('sql.js'))

const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'riot',
  external_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  region TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'disabled')),
  vault_secret_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_assignments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  assigned_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (account_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos')),
  device_name TEXT NOT NULL,
  app_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, public_key)
);

CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'starting' CHECK (status IN ('starting', 'active', 'stopping', 'ended', 'stale', 'error')),
  runtime_state TEXT NOT NULL DEFAULT 'LAUNCHING' CHECK (runtime_state IN ('LAUNCHING', 'IN_CLIENT', 'IN_GAME', 'RECONNECTING', 'EXITED')),
  started_at TEXT NOT NULL,
  last_heartbeat_at TEXT NOT NULL,
  ended_at TEXT,
  reconnect_grace_until TEXT,
  release_reason TEXT CHECK (release_reason IN ('manual', 'process_exit', 'logout', 'heartbeat_timeout', 'admin_force_release', 'error')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exclusive_account_session
  ON account_sessions (account_id)
  WHERE status IN ('starting', 'active', 'stopping');
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON account_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_user_active ON account_assignments(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
`

export type SqlParam = string | number | Uint8Array | null

export class AppDatabase {
  private savePromise: Promise<void> = Promise.resolve()

  private constructor(private readonly raw: SqlDatabase, readonly filePath: string) {}

  static async open(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const SQL = await initSqlJs({ locateFile: (file) => path.join(sqlJsPackageDir, file) })
    let raw: SqlDatabase
    try {
      const saved = await fs.readFile(filePath)
      raw = new SQL.Database(saved)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      raw = new SQL.Database()
    }
    const database = new AppDatabase(raw, filePath)
    database.exec(schemaSql)
    await database.save()
    return database
  }

  exec(sql: string) {
    this.raw.exec(sql)
  }

  run(sql: string, params: SqlParam[] = []) {
    this.raw.run(sql, params)
  }

  all<T extends Record<string, unknown>>(sql: string, params: SqlParam[] = []): T[] {
    const statement = this.raw.prepare(sql)
    try {
      statement.bind(params)
      const rows: T[] = []
      while (statement.step()) rows.push(statement.getAsObject() as T)
      return rows
    } finally {
      statement.free()
    }
  }

  get<T extends Record<string, unknown>>(sql: string, params: SqlParam[] = []): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  async transaction<T>(callback: () => T): Promise<T> {
    this.raw.exec('BEGIN IMMEDIATE')
    try {
      const result = callback()
      this.raw.exec('COMMIT')
      await this.save()
      return result
    } catch (error) {
      this.raw.exec('ROLLBACK')
      throw error
    }
  }

  transactionSync<T>(callback: () => T): T {
    this.raw.exec('BEGIN IMMEDIATE')
    try {
      const result = callback()
      this.raw.exec('COMMIT')
      return result
    } catch (error) {
      try { this.raw.exec('ROLLBACK') } catch { /* preserve the original error */ }
      throw error
    }
  }

  async save() {
    const bytes = this.raw.export()
    const temporary = `${this.filePath}.${process.pid}.tmp`
    this.savePromise = this.savePromise.then(async () => {
      await fs.writeFile(temporary, bytes, { mode: 0o600 })
      await fs.rename(temporary, this.filePath)
      await fs.chmod(this.filePath, 0o600)
    })
    return this.savePromise
  }

  close() {
    this.raw.close()
  }
}
