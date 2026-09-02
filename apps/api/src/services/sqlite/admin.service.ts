import { randomUUID } from 'node:crypto'
import type { DashboardActivity, DashboardMetrics, DashboardSession, DashboardSnapshot } from '@laap/types'
import type { AppDatabase } from '../../db/database.js'
import { ServiceError } from '../service-error.js'
import type { IAdminService } from '../domain/admin.js'
import type { IAccountService } from '../domain/accounts.js'
import type { IAuthService } from '../domain/auth.js'
import type { ILeaseService } from '../domain/leases.js'
import { initials, relativeTime, sessionTone } from './shared.js'

export class SqliteAdminService implements IAdminService {
  constructor(
    private readonly database: AppDatabase,
    private readonly authService: IAuthService,
    private readonly accountService: IAccountService,
    private readonly leaseService: ILeaseService
  ) {}

  addAudit(
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>
  ) {
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    this.database.run(
      'INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, actorId, action, entityType, entityId, JSON.stringify(payload), timestamp]
    )
  }

  recordAudit(
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>
  ) {
    this.addAudit(actorId, action, entityType, entityId, payload)
  }

  listAudit(limit = 100, offset = 0) {
    const query = `
      SELECT l.id, l.actor_id, l.action, l.entity_type, l.entity_id, l.payload_json, l.created_at, u.display_name AS actor_name
      FROM audit_logs l
      LEFT JOIN users u ON u.id = l.actor_id
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `
    return this.database.all<Record<string, unknown>>(query, [limit, offset]).map((row) => ({
      id: String(row.id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      payload: JSON.parse(String(row.payload_json ?? '{}')),
      createdAt: String(row.created_at),
      actor: String(row.actor_name ?? 'System'),
    }))
  }

  listAssignments() {
    return this.database
      .all<Record<string, unknown>>(
        `SELECT aa.id, aa.account_id, aa.user_id, aa.status, aa.assigned_at, aa.expires_at, a.display_name AS account, u.display_name AS user, u.email
         FROM account_assignments aa
         JOIN accounts a ON a.id = aa.account_id
         JOIN users u ON u.id = aa.user_id
         ORDER BY aa.assigned_at DESC`
      )
      .map((row) => ({
        id: String(row.id),
        accountId: String(row.account_id),
        userId: String(row.user_id),
        account: String(row.account),
        user: String(row.user),
        email: String(row.email),
        status: String(row.status),
        assignedAt: String(row.assigned_at),
        expiresAt: row.expires_at ? String(row.expires_at) : null,
      }))
  }

  addAssignment(actorId: string, accountId: string, userId: string, expiresAt: string | null) {
    return this.database.transactionSync(() => {
      if (!this.database.get<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [accountId])) {
        throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
      }
      if (!this.database.get<{ id: string }>(`SELECT id FROM users WHERE id = ? AND status = 'active'`, [userId])) {
        throw new ServiceError('USER_NOT_FOUND', 404)
      }
      const existing = this.database.get<{ id: string }>(
        'SELECT id FROM account_assignments WHERE account_id = ? AND user_id = ?',
        [accountId, userId]
      )
      const id = existing?.id ?? randomUUID()
      const timestamp = new Date().toISOString()
      if (existing) {
        this.database.run(
          `UPDATE account_assignments SET status = 'active', expires_at = ?, assigned_at = ? WHERE id = ?`,
          [expiresAt, timestamp, id]
        )
      } else {
        this.database.run(
          'INSERT INTO account_assignments (id, account_id, user_id, status, assigned_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, accountId, userId, 'active', timestamp, expiresAt, timestamp]
        )
      }
      this.addAudit(actorId, 'ASSIGNMENT_UPDATED', 'account_assignments', id, { accountId, userId })
      return id
    })
  }

  revokeAssignment(actorId: string, accountId: string, userId: string) {
    this.database.transactionSync(() => {
      const assignment = this.database.get<{ id: string }>(
        'SELECT id FROM account_assignments WHERE account_id = ? AND user_id = ?',
        [accountId, userId]
      )
      if (!assignment) throw new ServiceError('ASSIGNMENT_NOT_FOUND', 404)
      this.database.run(`UPDATE account_assignments SET status = 'revoked' WHERE id = ?`, [assignment.id])
      this.addAudit(actorId, 'ASSIGNMENT_REVOKED', 'account_assignments', assignment.id, { accountId, userId })
    })
  }

  getDashboard(userId: string): DashboardSnapshot {
    void this.leaseService.reapStaleSessions()
    const user = this.authService.findUserById(userId)
    if (!user) throw new ServiceError('USER_NOT_FOUND', 404)
    const scoped = user.role === 'admin' ? undefined : user.id
    return {
      user,
      metrics: this.getMetrics(scoped),
      sessions: this.listSessions(scoped),
      activity: this.listActivity(scoped),
      accounts: this.accountService.listAccounts(scoped) as any,
    }
  }

  getMetrics(userId?: string): DashboardMetrics {
    const scope = userId
      ? ` AND EXISTS (SELECT 1 FROM account_assignments aa WHERE aa.account_id = a.id AND aa.user_id = ? AND aa.status = 'active')`
      : ''
    const scopeParams = userId ? [userId] : []
    const available = this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM accounts a WHERE a.status = 'available' AND NOT EXISTS (SELECT 1 FROM account_sessions s WHERE s.account_id = a.id AND s.status IN ('starting', 'active', 'stopping'))${scope}`,
      scopeParams
    )
    const total = this.database.get<{ count: number }>('SELECT COUNT(*) AS count FROM accounts')
    const userClause = userId ? ' AND user_id = ?' : ''
    const userParam = userId ? [userId] : []
    const active = this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM account_sessions WHERE status IN ('starting', 'active', 'stopping')${userClause}`,
      userParam
    )
    const devices = this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM user_devices WHERE status = 'active'${userClause}`,
      userParam
    )
    const healthyDevices = this.database.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM user_devices WHERE status = 'active' AND last_seen_at > ?${userClause}`,
      [new Date(Date.now() - 5 * 60_000).toISOString(), ...userParam]
    )
    const users = this.database.get<{ count: number }>(`SELECT COUNT(*) AS count FROM users WHERE status = 'active'`)
    const userCount = userId ? 1 : Number(users?.count ?? 0)
    const scopedTotal = userId
      ? Number(
          this.database.get<{ count: number }>('SELECT COUNT(*) AS count FROM accounts a WHERE 1 = 1' + scope, scopeParams)
            ?.count ?? 0
        )
      : Number(total?.count ?? 0)

    return {
      availableAccounts: Number(available?.count ?? 0),
      totalAccounts: scopedTotal,
      activeLeases: Number(active?.count ?? 0),
      boundDevices: Number(devices?.count ?? 0),
      healthyDevices: Number(healthyDevices?.count ?? 0),
      authorizedUsers: userCount,
      activeUsers: userCount,
    }
  }

  listSessions(userId?: string) {
    const rows = this.database.all<{
      id: string
      account_id: string
      account_name: string
      region: string
      user_id: string
      user_name: string
      device_name: string
      platform: string
      status: DashboardSession['status']
      started_at: string
    }>(
      `SELECT s.id, s.account_id, a.display_name AS account_name, a.region, s.user_id, u.display_name AS user_name, d.device_name, d.platform, s.status, s.started_at
       FROM account_sessions s
       JOIN accounts a ON a.id = s.account_id
       JOIN users u ON u.id = s.user_id
       JOIN user_devices d ON d.id = s.device_id
       WHERE s.status IN ('starting', 'active', 'stopping')${userId ? ' AND s.user_id = ?' : ''}
       ORDER BY s.started_at DESC`,
      userId ? [userId] : []
    )
    return rows.map((row) => ({
      id: row.id,
      account: row.account_name,
      region: row.region,
      user: row.user_name,
      initials: initials(row.user_name),
      device: `${row.device_name} · ${row.platform === 'macos' ? 'macOS' : 'Windows'}`,
      status: row.status,
      started: relativeTime(row.started_at),
      avatarTone: sessionTone(row.user_id),
    })) satisfies DashboardSession[]
  }

  listActivity(userId?: string) {
    const rows = this.database.all<Record<string, unknown>>(
      `SELECT l.id, l.action, l.payload_json, l.created_at, COALESCE(u.display_name, 'System') AS actor
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_id${userId ? ' WHERE l.actor_id = ?' : ''}
       ORDER BY l.created_at DESC
       LIMIT 6`,
      userId ? [userId] : []
    )
    return rows.map((row, index) => {
      const payload = JSON.parse(String(row.payload_json ?? '{}')) as { account?: string }
      const action = String(row.action)
      const actionMap: Record<string, { title: string; tone: DashboardActivity['tone'] }> = {
        SESSION_STARTED: { title: 'Lease acquired', tone: 'success' },
        SESSION_ENDED: { title: 'Lease released', tone: 'neutral' },
        DEVICE_REGISTERED: { title: 'Device registered', tone: 'info' },
        ASSIGNMENT_UPDATED: { title: 'Assignment updated', tone: 'neutral' },
        ASSIGNMENT_REVOKED: { title: 'Assignment revoked', tone: 'warning' },
        SESSION_LAZILY_REAPED: { title: 'Stale session reaped', tone: 'warning' },
      }
      const mapped = actionMap[action] ?? {
        title: action.replaceAll('_', ' ').toLowerCase(),
        tone: 'neutral' as const,
      }
      const detail = payload.account
        ? `${payload.account} · ${String(row.actor)}`
        : `${String(row.actor)} · ${String(row.action).toLowerCase().replaceAll('_', ' ')}`
      return {
        id: String(row.id),
        title: mapped.title,
        detail,
        time: index === 0 ? 'Just now' : relativeTime(String(row.created_at)),
        tone: mapped.tone,
      }
    })
  }
}
