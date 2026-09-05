import { randomUUID } from 'node:crypto'
import type { DashboardAccount } from '@laap/types'
import type { AppDatabase } from '../../db/database.js'
import { ServiceError } from '../service-error.js'
import { decryptSecret, encryptSecret } from '../secret-box.js'
import type { IAccountService } from '../domain/accounts.js'
import { accountTone, relativeTime } from './shared.js'

export class SqliteAccountService implements IAccountService {
  constructor(
    private readonly database: AppDatabase,
    private readonly addAuditFn: (actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) => void,
    private readonly vaultKey: string
  ) {}

  listAccounts(userId?: string) {
    const query = `
      SELECT a.id, a.external_id, a.display_name, a.region, a.status, a.metadata_json, a.session_blob,
        s.started_at, session_user.display_name AS session_user_name, session_device.device_name AS session_device_name,
        CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS leased,
        COALESCE(s.started_at, a.updated_at) AS last_used
      FROM accounts a
      LEFT JOIN account_sessions s ON s.account_id = a.id AND s.status IN ('starting', 'active', 'stopping')
      LEFT JOIN users session_user ON session_user.id = s.user_id
      LEFT JOIN user_devices session_device ON session_device.id = s.device_id
      ${userId ? 'JOIN account_assignments mine ON mine.account_id = a.id AND mine.user_id = ? AND mine.status = \'active\' AND (mine.expires_at IS NULL OR mine.expires_at > ?)' : ''}
      ORDER BY CASE WHEN s.id IS NOT NULL THEN 0 ELSE 1 END, last_used DESC, a.display_name
    `
    const rows = this.database.all<Record<string, unknown>>(query, userId ? [userId, new Date().toISOString()] : [])
    return rows.map((row, index) => {
      const metadata = JSON.parse(String(row.metadata_json ?? '{}')) as { level?: number }
      const dbStatus = String(row.status)
      const status: DashboardAccount['status'] =
        dbStatus === 'maintenance'
          ? 'Maintenance'
          : dbStatus === 'disabled'
            ? 'Disabled'
            : Number(row.leased) === 1
              ? 'Leased'
              : 'Available'
      return {
        id: String(row.id),
        name: String(row.display_name),
        externalId: String(row.external_id),
        region: String(row.region),
        status,
        lastUsed: relativeTime(String(row.last_used)),
        level: metadata.level ?? 120 + (index % 170),
        accent: accountTone(String(row.id)),
        hasSessionBlob: Boolean(row.session_blob),
        activeUser: row.session_user_name ? String(row.session_user_name) : undefined,
        activeDevice: row.session_device_name ? String(row.session_device_name) : undefined,
        sessionStarted: row.started_at ? String(row.started_at) : undefined,
      }
    })
  }

  createAccount(
    actorId: string,
    input: { displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }
  ) {
    return this.database.transactionSync(() => {
      const duplicate = this.database.get<{ id: string }>(
        'SELECT id FROM accounts WHERE external_id = ?',
        [input.externalId]
      )
      if (duplicate) throw new ServiceError('ACCOUNT_EXISTS', 409)
      const id = randomUUID()
      const timestamp = new Date().toISOString()
      this.database.run(
        'INSERT INTO accounts (id, provider, external_id, display_name, region, status, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, 'riot', input.externalId, input.displayName, input.region, input.status, '{}', timestamp, timestamp]
      )
      this.addAuditFn(actorId, 'ACCOUNT_CREATED', 'accounts', id, {
        displayName: input.displayName,
        region: input.region,
      })
      return id
    })
  }

  updateAccount(
    actorId: string,
    accountId: string,
    input: Partial<{ displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }>
  ) {
    this.database.transactionSync(() => {
      const current = this.database.get<{ id: string; status: string }>('SELECT id, status FROM accounts WHERE id = ?', [accountId])
      if (!current) {
        throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
      }
      if (input.status && input.status !== 'available' && input.status !== current.status) {
        const activeSession = this.database.get<{ id: string }>(
          `SELECT id FROM account_sessions WHERE account_id = ? AND status IN ('starting', 'active', 'stopping')`,
          [accountId]
        )
        if (activeSession) throw new ServiceError('ACCOUNT_BUSY', 409)
      }
      if (
        input.externalId &&
        this.database.get<{ id: string }>('SELECT id FROM accounts WHERE external_id = ? AND id <> ?', [input.externalId, accountId])
      ) {
        throw new ServiceError('ACCOUNT_EXISTS', 409)
      }
      const fields = Object.entries(input).filter(([, value]) => value !== undefined)
      if (fields.length) {
        const setClause = fields
          .map(([key]) => `${key === 'displayName' ? 'display_name' : key === 'externalId' ? 'external_id' : key} = ?`)
          .join(', ')
        this.database.run(
          `UPDATE accounts SET ${setClause}, updated_at = ? WHERE id = ?`,
          [...fields.map(([, value]) => value as string), new Date().toISOString(), accountId]
        )
      }
      this.addAuditFn(actorId, 'ACCOUNT_UPDATED', 'accounts', accountId, { fields: fields.map(([key]) => key) })
    })
  }

  deleteAccount(actorId: string, accountId: string) {
    this.database.transactionSync(() => {
      if (!this.database.get<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [accountId])) {
        throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
      }
      if (
        this.database.get<{ id: string }>(
          `SELECT id FROM account_sessions WHERE account_id = ? AND status IN ('starting', 'active', 'stopping')`,
          [accountId]
        )
      ) {
        throw new ServiceError('ACCOUNT_BUSY', 409)
      }
      this.database.run('DELETE FROM accounts WHERE id = ?', [accountId])
      this.addAuditFn(actorId, 'ACCOUNT_DELETED', 'accounts', accountId, {})
    })
  }

  saveAccountSessionBlob(actorId: string, accountId: string, sessionBlob: string) {
    this.database.transactionSync(() => {
      if (!this.database.get<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [accountId])) {
        throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
      }
      this.database.run('UPDATE accounts SET session_blob = ?, updated_at = ? WHERE id = ?', [
        encryptSecret(sessionBlob, this.vaultKey, `account:${accountId}`),
        new Date().toISOString(),
        accountId,
      ])
      this.addAuditFn(actorId, 'SESSION_BLOB_UPDATED', 'accounts', accountId, {})
    })
  }

  getAccountSessionBlob(userId: string, sessionId: string) {
    const session = this.database.get<{ account_id: string }>(
      `SELECT account_id FROM account_sessions WHERE id = ? AND user_id = ? AND status IN ('starting', 'active')`,
      [sessionId, userId]
    )
    if (!session) throw new ServiceError('SESSION_NOT_FOUND', 404)
    const account = this.database.get<{ session_blob: string | null }>(
      'SELECT session_blob FROM accounts WHERE id = ?',
      [session.account_id]
    )
    if (!account || !account.session_blob) throw new ServiceError('NO_SESSION_BLOB', 404)
    const decrypted = decryptSecret(account.session_blob, this.vaultKey, `account:${session.account_id}`)
    if (decrypted.legacyPlaintext) {
      this.database.run('UPDATE accounts SET session_blob = ?, updated_at = ? WHERE id = ?', [
        encryptSecret(decrypted.value, this.vaultKey, `account:${session.account_id}`),
        new Date().toISOString(),
        session.account_id,
      ])
    }
    return decrypted.value
  }

  deleteAccountSessionBlob(actorId: string, accountId: string) {
    this.database.transactionSync(() => {
      if (!this.database.get<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [accountId])) {
        throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
      }
      this.database.run('UPDATE accounts SET session_blob = NULL, updated_at = ? WHERE id = ?', [
        new Date().toISOString(),
        accountId,
      ])
      this.addAuditFn(actorId, 'SESSION_BLOB_DELETED', 'accounts', accountId, {})
    })
  }
}
