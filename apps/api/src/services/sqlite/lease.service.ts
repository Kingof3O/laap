import { randomUUID } from 'node:crypto'
import type { ApiUser, SessionRuntimeState } from '@laap/types'
import { releaseLeaseSchema } from '@laap/validation'
import type { AppDatabase } from '../../db/database.js'
import { ServiceError } from '../service-error.js'
import type { ILeaseService } from '../domain/leases.js'

export class SqliteLeaseService implements ILeaseService {
  constructor(
    private readonly database: AppDatabase,
    private readonly addAuditFn: (actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) => void
  ) {}

  reapStaleSessions(persist = true) {
    const now = Date.now()
    const cutoff = new Date(now - 120_000).toISOString()
    const stale = this.database.all<{ id: string; user_id: string; account_id: string }>(
      `SELECT id, user_id, account_id FROM account_sessions WHERE status IN ('starting', 'active', 'stopping') AND last_heartbeat_at < ? AND (reconnect_grace_until IS NULL OR reconnect_grace_until <= ?)`,
      [cutoff, new Date(now).toISOString()]
    )
    for (const session of stale) {
      this.database.run(
        `UPDATE account_sessions SET status = 'stale', runtime_state = 'EXITED', ended_at = ?, release_reason = 'heartbeat_timeout' WHERE id = ?`,
        [new Date(now).toISOString(), session.id]
      )
      this.addAuditFn(session.user_id, 'SESSION_LAZILY_REAPED', 'account_sessions', session.id, {
        accountId: session.account_id,
      })
    }
    if (persist && stale.length) void this.database.save()
    return stale.length
  }

  acquireLease(
    userId: string,
    accountId: string,
    deviceId: string,
    options: { nonce?: string; signature?: string } = {}
  ) {
    return this.database.transaction(() => {
      this.reapStaleSessions(false)
      const user = this.database.get<{ id: string; role: string }>('SELECT id, role FROM users WHERE id = ?', [
        userId,
      ])
      const isAdmin = user?.role === 'admin'
      const assignment = this.database.get<{ id: string; expires_at: string | null }>(
        `SELECT id, expires_at FROM account_assignments WHERE account_id = ? AND user_id = ? AND status = 'active'`,
        [accountId, userId]
      )
      if (
        !isAdmin &&
        (!assignment || (assignment.expires_at && new Date(assignment.expires_at).getTime() <= Date.now()))
      ) {
        throw new ServiceError('NO_ACTIVE_ASSIGNMENT', 403)
      }

      const device = this.database.get<{ id: string }>(
        `SELECT id FROM user_devices WHERE id = ? AND user_id = ? AND status = 'active'`,
        [deviceId, userId]
      )
      if (!device) throw new ServiceError('DEVICE_NOT_AUTHORIZED', 403)

      const account = this.database.get<{ id: string; status: string }>(
        'SELECT id, status FROM accounts WHERE id = ?',
        [accountId]
      )
      if (!account || account.status !== 'available') throw new ServiceError('ACCOUNT_UNAVAILABLE', 409)

      const active = this.database.get<{ id: string; user_id: string; device_id: string; started_at: string }>(
        `SELECT id, user_id, device_id, started_at FROM account_sessions WHERE account_id = ? AND status IN ('starting', 'active', 'stopping')`,
        [accountId]
      )
      if (active) {
        // Automatically expire leases older than 4 hours
        if (new Date(active.started_at).getTime() < Date.now() - 4 * 3600_000) {
          this.database.run(
            `UPDATE account_sessions SET status = 'stale', runtime_state = 'EXITED', ended_at = ?, release_reason = 'lease_timeout' WHERE id = ?`,
            [new Date().toISOString(), active.id]
          )
          this.addAuditFn(userId, 'SESSION_LAZILY_REAPED', 'account_sessions', active.id, { accountId })
        } else if (active.user_id === userId && active.device_id === deviceId) {
          return { success: true as const, sessionId: active.id, isReconnect: true }
        } else {
          throw new ServiceError('ACCOUNT_BUSY', 409)
        }
      }

      const sessionId = randomUUID()
      const timestamp = new Date().toISOString()
      this.database.run(
        `INSERT INTO account_sessions (id, account_id, user_id, device_id, status, runtime_state, started_at, last_heartbeat_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, accountId, userId, deviceId, 'active', 'LAUNCHING', timestamp, timestamp, timestamp]
      )
      this.addAuditFn(userId, 'SESSION_STARTED', 'account_sessions', sessionId, {
        accountId,
        deviceId,
        signed: Boolean(options.nonce && options.signature),
      })
      return { success: true as const, sessionId, isReconnect: false }
    })
  }

  releaseLease(actor: ApiUser, sessionId: string, reason: string) {
    const parsed = releaseLeaseSchema.safeParse({ sessionId, reason })
    if (!parsed.success) throw new ServiceError('INVALID_RELEASE_REASON', 400)
    return this.database.transaction(() => {
      const session = this.database.get<{ id: string; user_id: string; account_id: string }>(
        'SELECT id, user_id, account_id FROM account_sessions WHERE id = ?',
        [sessionId]
      )
      if (!session) throw new ServiceError('SESSION_NOT_FOUND', 404)
      if (session.user_id !== actor.id && actor.role !== 'admin') {
        throw new ServiceError('FORBIDDEN', 403)
      }
      const releaseReason = actor.role === 'admin' && session.user_id !== actor.id ? 'admin_force_release' : reason
      this.database.run(
        `UPDATE account_sessions SET status = 'ended', runtime_state = 'EXITED', ended_at = ?, release_reason = ? WHERE id = ?`,
        [new Date().toISOString(), releaseReason, sessionId]
      )
      this.addAuditFn(actor.id, 'SESSION_ENDED', 'account_sessions', sessionId, { releaseReason, accountId: session.account_id })
      return { success: true as const }
    })
  }

  heartbeatLease(userId: string, sessionId: string, runtimeState: SessionRuntimeState) {
    return this.database.transaction(() => {
      const session = this.database.get<{ id: string; user_id: string; account_id: string; status: string }>(
        'SELECT id, user_id, account_id, status FROM account_sessions WHERE id = ?',
        [sessionId]
      )
      if (!session || session.user_id !== userId || !['starting', 'active'].includes(session.status)) {
        throw new ServiceError('SESSION_NOT_FOUND', 404)
      }
      const user = this.database.get<{ role: string }>('SELECT role FROM users WHERE id = ?', [userId])
      if (user?.role !== 'admin' && !this.database.get<{ id: string }>(
        `SELECT id FROM account_assignments WHERE account_id = ? AND user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)`,
        [session.account_id, userId, new Date().toISOString()]
      )) {
        const timestamp = new Date().toISOString()
        this.database.run(
          `UPDATE account_sessions SET status = 'ended', runtime_state = 'EXITED', ended_at = ?, release_reason = 'error' WHERE id = ?`,
          [timestamp, sessionId]
        )
        this.addAuditFn(userId, 'SESSION_ENDED', 'account_sessions', sessionId, { accountId: session.account_id, releaseReason: 'assignment_expired' })
        return { released: 'ASSIGNMENT_EXPIRED' as const }
      }
      const timestamp = new Date().toISOString()
      if (runtimeState === 'EXITED') {
        this.database.run(
          `UPDATE account_sessions SET status = 'ended', runtime_state = 'EXITED', ended_at = ?, release_reason = 'process_exit' WHERE id = ?`,
          [timestamp, sessionId]
        )
        this.addAuditFn(userId, 'SESSION_ENDED', 'account_sessions', sessionId, { releaseReason: 'process_exit' })
      } else {
        this.database.run(
          `UPDATE account_sessions SET status = 'active', runtime_state = ?, last_heartbeat_at = ?, reconnect_grace_until = ? WHERE id = ?`,
          [runtimeState, timestamp, runtimeState === 'RECONNECTING' ? new Date(Date.now() + 300_000).toISOString() : null, sessionId]
        )
      }
      return { success: true as const }
    }).then((result) => {
      if (result.released) throw new ServiceError(result.released, 403)
      return result
    })
  }

  forceReleaseAccount(actor: ApiUser, accountId: string) {
    if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 403)
    return this.database.transactionSync(() => {
      const session = this.database.get<{ id: string }>(
        `SELECT id FROM account_sessions WHERE account_id = ? AND status IN ('starting', 'active', 'stopping')`,
        [accountId]
      )
      const timestamp = new Date().toISOString()
      if (session) {
        this.database.run(
          `UPDATE account_sessions SET status = 'ended', runtime_state = 'EXITED', ended_at = ?, release_reason = 'admin_force_release' WHERE id = ?`,
          [timestamp, session.id]
        )
        this.addAuditFn(actor.id, 'SESSION_ENDED', 'account_sessions', session.id, { accountId, releaseReason: 'admin_force_release' })
      }
      this.addAuditFn(actor.id, 'SESSION_ENDED', 'accounts', accountId, { releaseReason: 'admin_force_release' })
      return { success: true as const }
    })
  }
}
