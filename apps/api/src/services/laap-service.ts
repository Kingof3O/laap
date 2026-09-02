import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { ApiUser, DashboardAccount, DashboardActivity, DashboardMetrics, DashboardSession, DashboardSnapshot, UserRole } from '@laap/types'
import { releaseLeaseSchema } from '@laap/validation'
import type { AppDatabase } from '../db/database.js'
import type { LaapServicePort } from './service-port.js'
import { ServiceError } from './service-error.js'

type UserRow = { id: string; email: string; password_hash: string; display_name: string; role: UserRole; status: ApiUser['status'] }

const avatarTones: DashboardSession['avatarTone'][] = ['violet', 'cyan', 'amber', 'rose']
const accountAccents: DashboardAccount['accent'][] = ['violet', 'cyan', 'orange', 'lime', 'rose']

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function minutesSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}

function relativeTime(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds} sec ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m ago`
}

function sessionTone(userId: string) {
  return avatarTones[userId.charCodeAt(0) % avatarTones.length]
}

function accountTone(accountId: string) {
  return accountAccents[accountId.charCodeAt(0) % accountAccents.length]
}

function publicUser(row: UserRow): ApiUser {
  return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, status: row.status }
}

export class LaapService implements LaapServicePort {
  constructor(private readonly database: AppDatabase) {}

  findUserByEmail(email: string) {
    return this.database.get<UserRow>('SELECT id, email, password_hash, display_name, role, status FROM users WHERE lower(email) = lower(?)', [email])
  }

  findUserById(id: string) {
    const row = this.database.get<UserRow>('SELECT id, email, password_hash, display_name, role, status FROM users WHERE id = ?', [id])
    return row ? publicUser(row) : undefined
  }

  async authenticate(email: string, password: string) {
    const user = this.findUserByEmail(email)
    if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.password_hash))) throw new ServiceError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect')
    return publicUser(user)
  }

  listUsers() {
    return this.database.all<UserRow>('SELECT id, email, password_hash, display_name, role, status FROM users ORDER BY display_name').map(publicUser)
  }

  async createUser(actorId: string, input: { email: string; displayName: string; password: string; role: 'admin' | 'operator' }) {
    const existing = this.database.get<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower(?)', [input.email])
    if (existing) throw new ServiceError('USER_EXISTS', 409, 'A user with this email already exists')
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    const passwordHash = await bcrypt.hash(input.password, 12)
    this.database.transactionSync(() => {
      this.database.run('INSERT INTO users (id, email, password_hash, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, input.email.toLowerCase(), passwordHash, input.displayName, input.role, 'active', timestamp, timestamp])
      this.addAudit(actorId, 'USER_CREATED', 'users', id, { email: input.email.toLowerCase(), role: input.role })
    })
    return { id, email: input.email.toLowerCase(), displayName: input.displayName, role: input.role, status: 'active' } as ApiUser
  }

  listDevices(userId?: string) {
    const query = `SELECT d.id, d.user_id, d.public_key, d.platform, d.device_name, d.app_version, d.status, d.last_seen_at, u.display_name AS user_name FROM user_devices d JOIN users u ON u.id = d.user_id ${userId ? 'WHERE d.user_id = ?' : ''} ORDER BY d.last_seen_at DESC`
    return this.database.all<Record<string, unknown>>(query, userId ? [userId] : []).map((row) => ({ id: String(row.id), userId: String(row.user_id), deviceName: String(row.device_name), platform: String(row.platform), appVersion: String(row.app_version), status: String(row.status), lastSeenAt: String(row.last_seen_at), user: String(row.user_name), publicKeyPresent: Boolean(row.public_key) }))
  }

  registerDevice(userId: string, input: { publicKey: string; platform: 'windows' | 'macos'; deviceName: string; appVersion: string }) {
    return this.database.transactionSync(() => {
      const existing = this.database.get<{ id: string }>('SELECT id FROM user_devices WHERE user_id = ? AND public_key = ?', [userId, input.publicKey])
      if (existing) {
        this.database.run('UPDATE user_devices SET device_name = ?, app_version = ?, status = \'active\', last_seen_at = ? WHERE id = ?', [input.deviceName, input.appVersion, new Date().toISOString(), existing.id])
        return existing.id
      }
      const id = randomUUID()
      const timestamp = new Date().toISOString()
      this.database.run('INSERT INTO user_devices (id, user_id, public_key, platform, device_name, app_version, status, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, userId, input.publicKey, input.platform, input.deviceName, input.appVersion, 'active', timestamp, timestamp])
      this.addAudit(userId, 'DEVICE_REGISTERED', 'user_devices', id, { platform: input.platform })
      return id
    })
  }

  revokeDevice(actorId: string, deviceId: string) {
    this.database.transactionSync(() => {
      if (!this.database.get<{ id: string }>('SELECT id FROM user_devices WHERE id = ?', [deviceId])) throw new ServiceError('DEVICE_NOT_FOUND', 404)
      this.database.run('UPDATE user_devices SET status = \'revoked\' WHERE id = ?', [deviceId])
      this.addAudit(actorId, 'DEVICE_REVOKED', 'user_devices', deviceId, {})
    })
  }

  listAccounts(userId?: string) {
    const query = `
      SELECT a.id, a.display_name, a.region, a.status, a.metadata_json, a.session_blob,
        CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS leased,
        COALESCE(s.started_at, a.updated_at) AS last_used
      FROM accounts a
      LEFT JOIN account_sessions s ON s.account_id = a.id AND s.status IN ('starting', 'active', 'stopping')
      ${userId ? 'JOIN account_assignments mine ON mine.account_id = a.id AND mine.user_id = ? AND mine.status = \'active\'' : ''}
      ORDER BY CASE WHEN s.id IS NOT NULL THEN 0 ELSE 1 END, last_used DESC, a.display_name
    `
    const rows = this.database.all<Record<string, unknown>>(query, userId ? [userId] : [])
    return rows.map((row, index) => {
      const metadata = JSON.parse(String(row.metadata_json ?? '{}')) as { level?: number }
      const dbStatus = String(row.status)
      const status: DashboardAccount['status'] = dbStatus === 'maintenance' ? 'Maintenance' : dbStatus === 'disabled' ? 'Disabled' : Number(row.leased) === 1 ? 'Leased' : 'Available'
      return { id: String(row.id), name: String(row.display_name), region: String(row.region), status, lastUsed: relativeTime(String(row.last_used)), level: metadata.level ?? 120 + (index % 170), accent: accountTone(String(row.id)), hasSessionBlob: Boolean(row.session_blob) }
    })
  }

  createAccount(actorId: string, input: { displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }) {
    return this.database.transactionSync(() => {
      const duplicate = this.database.get<{ id: string }>('SELECT id FROM accounts WHERE external_id = ?', [input.externalId])
      if (duplicate) throw new ServiceError('ACCOUNT_EXISTS', 409)
      const id = randomUUID()
      const timestamp = new Date().toISOString()
      this.database.run('INSERT INTO accounts (id, provider, external_id, display_name, region, status, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, 'riot', input.externalId, input.displayName, input.region, input.status, '{}', timestamp, timestamp])
      this.addAudit(actorId, 'ACCOUNT_CREATED', 'accounts', id, { displayName: input.displayName, region: input.region })
      return id
    })
  }

  updateAccount(actorId: string, accountId: string, input: Partial<{ displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }>) {
    this.database.transactionSync(() => {
      if (!this.database.get<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [accountId])) throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
      if (input.externalId && this.database.get<{ id: string }>('SELECT id FROM accounts WHERE external_id = ? AND id <> ?', [input.externalId, accountId])) throw new ServiceError('ACCOUNT_EXISTS', 409)
      const fields = Object.entries(input).filter(([, value]) => value !== undefined)
      if (fields.length) {
        const setClause = fields.map(([key]) => `${key === 'displayName' ? 'display_name' : key === 'externalId' ? 'external_id' : key} = ?`).join(', ')
        this.database.run(`UPDATE accounts SET ${setClause}, updated_at = ? WHERE id = ?`, [...fields.map(([, value]) => value as string), new Date().toISOString(), accountId])
      }
      this.addAudit(actorId, 'ACCOUNT_UPDATED', 'accounts', accountId, { fields: fields.map(([key]) => key) })
    })
  }

  deleteAccount(actorId: string, accountId: string) {
    this.database.transactionSync(() => {
      if (!this.database.get<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [accountId])) throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
      if (this.database.get<{ id: string }>(`SELECT id FROM account_sessions WHERE account_id = ? AND status IN ('starting', 'active', 'stopping')`, [accountId])) throw new ServiceError('ACCOUNT_BUSY', 409)
      this.database.run('DELETE FROM accounts WHERE id = ?', [accountId])
      this.addAudit(actorId, 'ACCOUNT_DELETED', 'accounts', accountId, {})
    })
  }

  listAssignments() {
    return this.database.all<Record<string, unknown>>('SELECT aa.id, aa.account_id, aa.user_id, aa.status, aa.assigned_at, aa.expires_at, a.display_name AS account, u.display_name AS user, u.email FROM account_assignments aa JOIN accounts a ON a.id = aa.account_id JOIN users u ON u.id = aa.user_id ORDER BY aa.assigned_at DESC').map((row) => ({ id: String(row.id), accountId: String(row.account_id), userId: String(row.user_id), account: String(row.account), user: String(row.user), email: String(row.email), status: String(row.status), assignedAt: String(row.assigned_at), expiresAt: row.expires_at ? String(row.expires_at) : null }))
  }

  addAssignment(actorId: string, accountId: string, userId: string, expiresAt: string | null) {
    return this.database.transactionSync(() => {
      if (!this.database.get<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [accountId])) throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
      if (!this.database.get<{ id: string }>('SELECT id FROM users WHERE id = ? AND status = \'active\'', [userId])) throw new ServiceError('USER_NOT_FOUND', 404)
      const existing = this.database.get<{ id: string }>('SELECT id FROM account_assignments WHERE account_id = ? AND user_id = ?', [accountId, userId])
      const id = existing?.id ?? randomUUID()
      const timestamp = new Date().toISOString()
      if (existing) this.database.run('UPDATE account_assignments SET status = \'active\', expires_at = ?, assigned_at = ? WHERE id = ?', [expiresAt, timestamp, id])
      else this.database.run('INSERT INTO account_assignments (id, account_id, user_id, status, assigned_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, accountId, userId, 'active', timestamp, expiresAt, timestamp])
      this.addAudit(actorId, 'ASSIGNMENT_UPDATED', 'account_assignments', id, { accountId, userId })
      return id
    })
  }

  verifyDeviceChallenge(userId: string, deviceId: string, accountId: string, nonce: string, signature: string) {
    const [timestampText, nonceAccountId] = nonce.split(':', 2)
    const timestamp = Number(timestampText)
    if (!Number.isFinite(timestamp) || nonceAccountId !== accountId || Math.abs(Date.now() - timestamp) > 5 * 60_000) return false
    const device = this.database.get<{ public_key: string }>('SELECT public_key FROM user_devices WHERE id = ? AND user_id = ? AND status = \'active\'', [deviceId, userId])
    if (!device) return false
    try {
      const rawPublicKey = Buffer.from(device.public_key, 'base64')
      const rawSignature = Buffer.from(signature, 'base64')
      if (rawPublicKey.length !== 32 || rawSignature.length !== 64) return false
      const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawPublicKey]), format: 'der', type: 'spki' })
      return verifySignature(null, Buffer.from(nonce), publicKey, rawSignature)
    } catch {
      return false
    }
  }

  revokeAssignment(actorId: string, accountId: string, userId: string) {
    this.database.transactionSync(() => {
      const assignment = this.database.get<{ id: string }>('SELECT id FROM account_assignments WHERE account_id = ? AND user_id = ?', [accountId, userId])
      if (!assignment) throw new ServiceError('ASSIGNMENT_NOT_FOUND', 404)
      this.database.run('UPDATE account_assignments SET status = \'revoked\' WHERE id = ?', [assignment.id])
      this.addAudit(actorId, 'ASSIGNMENT_REVOKED', 'account_assignments', assignment.id, { accountId, userId })
    })
  }

  getDashboard(userId: string): DashboardSnapshot {
    this.reapStaleSessions()
    const user = this.findUserById(userId)
    if (!user) throw new ServiceError('USER_NOT_FOUND', 404)
    const scoped = user.role === 'admin' ? undefined : user.id
    return { user, metrics: this.getMetrics(scoped), sessions: this.listSessions(scoped), activity: this.listActivity(scoped), accounts: this.listAccounts(scoped) }
  }

  getMetrics(userId?: string): DashboardMetrics {
    const scope = userId ? ' AND EXISTS (SELECT 1 FROM account_assignments aa WHERE aa.account_id = a.id AND aa.user_id = ? AND aa.status = \'active\')' : ''
    const scopeParams = userId ? [userId] : []
    const available = this.database.get<{ count: number }>(`SELECT COUNT(*) AS count FROM accounts a WHERE a.status = 'available' AND NOT EXISTS (SELECT 1 FROM account_sessions s WHERE s.account_id = a.id AND s.status IN ('starting', 'active', 'stopping'))${scope}`, scopeParams)
    const total = this.database.get<{ count: number }>('SELECT COUNT(*) AS count FROM accounts')
    const userClause = userId ? ' AND user_id = ?' : ''
    const userParam = userId ? [userId] : []
    const active = this.database.get<{ count: number }>(`SELECT COUNT(*) AS count FROM account_sessions WHERE status IN ('starting', 'active', 'stopping')${userClause}`, userParam)
    const devices = this.database.get<{ count: number }>(`SELECT COUNT(*) AS count FROM user_devices WHERE status = 'active'${userClause}`, userParam)
    const healthyDevices = this.database.get<{ count: number }>(`SELECT COUNT(*) AS count FROM user_devices WHERE status = 'active' AND last_seen_at > ?${userClause}`, [new Date(Date.now() - 5 * 60_000).toISOString(), ...userParam])
    const users = this.database.get<{ count: number }>(`SELECT COUNT(*) AS count FROM users WHERE status = 'active'`)
    const userCount = userId ? 1 : Number(users?.count ?? 0)
    const scopedTotal = userId ? Number(this.database.get<{ count: number }>('SELECT COUNT(*) AS count FROM accounts a WHERE 1 = 1' + scope, scopeParams)?.count ?? 0) : Number(total?.count ?? 0)
    return { availableAccounts: Number(available?.count ?? 0), totalAccounts: scopedTotal, activeLeases: Number(active?.count ?? 0), boundDevices: Number(devices?.count ?? 0), healthyDevices: Number(healthyDevices?.count ?? 0), authorizedUsers: userCount, activeUsers: userCount }
  }

  listSessions(userId?: string) {
    const rows = this.database.all<{ id: string; account_id: string; account_name: string; region: string; user_id: string; user_name: string; device_name: string; platform: string; status: DashboardSession['status']; started_at: string }>(`SELECT s.id, s.account_id, a.display_name AS account_name, a.region, s.user_id, u.display_name AS user_name, d.device_name, d.platform, s.status, s.started_at FROM account_sessions s JOIN accounts a ON a.id = s.account_id JOIN users u ON u.id = s.user_id JOIN user_devices d ON d.id = s.device_id WHERE s.status IN ('starting', 'active', 'stopping')${userId ? ' AND s.user_id = ?' : ''} ORDER BY s.started_at DESC`, userId ? [userId] : [])
    return rows.map((row) => ({ id: row.id, account: row.account_name, region: row.region, user: row.user_name, initials: initials(row.user_name), device: `${row.device_name} · ${row.platform === 'macos' ? 'macOS' : 'Windows'}`, status: row.status, started: relativeTime(row.started_at), avatarTone: sessionTone(row.user_id) })) satisfies DashboardSession[]
  }

  listActivity(userId?: string) {
    const rows = this.database.all<Record<string, unknown>>(`SELECT l.id, l.action, l.payload_json, l.created_at, COALESCE(u.display_name, 'System') AS actor FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id${userId ? ' WHERE l.actor_id = ?' : ''} ORDER BY l.created_at DESC LIMIT 6`, userId ? [userId] : [])
    return rows.map((row, index) => {
      const payload = JSON.parse(String(row.payload_json ?? '{}')) as { account?: string }
      const action = String(row.action)
      const actionMap: Record<string, { title: string; tone: DashboardActivity['tone'] }> = { SESSION_STARTED: { title: 'Lease acquired', tone: 'success' }, SESSION_ENDED: { title: 'Lease released', tone: 'neutral' }, DEVICE_REGISTERED: { title: 'Device registered', tone: 'info' }, ASSIGNMENT_UPDATED: { title: 'Assignment updated', tone: 'neutral' }, ASSIGNMENT_REVOKED: { title: 'Assignment revoked', tone: 'warning' }, SESSION_LAZILY_REAPED: { title: 'Stale session reaped', tone: 'warning' } }
      const mapped = actionMap[action] ?? { title: action.replaceAll('_', ' ').toLowerCase(), tone: 'neutral' as const }
      const detail = payload.account ? `${payload.account} · ${String(row.actor)}` : `${String(row.actor)} · ${String(row.action).toLowerCase().replaceAll('_', ' ')}`
      return { id: String(row.id), title: mapped.title, detail, time: index === 0 ? 'Just now' : relativeTime(String(row.created_at)), tone: mapped.tone }
    })
  }

  acquireLease(userId: string, accountId: string, deviceId: string, options: { nonce?: string; signature?: string } = {}) {
    return this.database.transaction(() => {
      this.reapStaleSessions(false)
      const user = this.database.get<{ id: string; role: string }>('SELECT id, role FROM users WHERE id = ?', [userId])
      const isAdmin = user?.role === 'admin'
      const assignment = this.database.get<{ id: string; expires_at: string | null }>('SELECT id, expires_at FROM account_assignments WHERE account_id = ? AND user_id = ? AND status = \'active\'', [accountId, userId])
      if (!isAdmin && (!assignment || (assignment.expires_at && new Date(assignment.expires_at).getTime() <= Date.now()))) throw new ServiceError('NO_ACTIVE_ASSIGNMENT', 403)
      const device = this.database.get<{ id: string }>('SELECT id FROM user_devices WHERE id = ? AND user_id = ? AND status = \'active\'', [deviceId, userId])
      if (!device) throw new ServiceError('DEVICE_NOT_AUTHORIZED', 403)
      const account = this.database.get<{ id: string; status: string }>('SELECT id, status FROM accounts WHERE id = ?', [accountId])
      if (!account || account.status !== 'available') throw new ServiceError('ACCOUNT_UNAVAILABLE', 409)
      const active = this.database.get<{ id: string; user_id: string; device_id: string; started_at: string }>(`SELECT id, user_id, device_id, started_at FROM account_sessions WHERE account_id = ? AND status IN ('starting', 'active', 'stopping')`, [accountId])
      if (active) {
        // Automatically expire leases older than 4 hours
        if (new Date(active.started_at).getTime() < Date.now() - 4 * 3600_000) {
          this.database.run('UPDATE account_sessions SET status = \'stale\', ended_at = ?, release_reason = \'lease_timeout\' WHERE id = ?', [new Date().toISOString(), active.id])
          this.addAudit(userId, 'SESSION_LAZILY_REAPED', 'account_sessions', active.id, { accountId })
        } else if (active.user_id === userId && active.device_id === deviceId) {
          return { success: true as const, sessionId: active.id, isReconnect: true }
        } else {
          throw new ServiceError('ACCOUNT_BUSY', 409)
        }
      }
      const sessionId = randomUUID()
      const timestamp = new Date().toISOString()
      this.database.run('INSERT INTO account_sessions (id, account_id, user_id, device_id, status, runtime_state, started_at, last_heartbeat_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [sessionId, accountId, userId, deviceId, 'active', 'LAUNCHING', timestamp, timestamp, timestamp])
      this.addAudit(userId, 'SESSION_STARTED', 'account_sessions', sessionId, { accountId, deviceId, signed: Boolean(options.nonce && options.signature) })
      return { success: true as const, sessionId, isReconnect: false }
    })
  }

  releaseLease(actor: ApiUser, sessionId: string, reason: string) {
    const parsed = releaseLeaseSchema.safeParse({ sessionId, reason })
    if (!parsed.success) throw new ServiceError('INVALID_RELEASE_REASON', 400)
    return this.database.transaction(() => {
      const session = this.database.get<{ id: string; user_id: string }>('SELECT id, user_id FROM account_sessions WHERE id = ?', [sessionId])
      if (!session) throw new ServiceError('SESSION_NOT_FOUND', 404)
      if (session.user_id !== actor.id && actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 403)
      const releaseReason = actor.role === 'admin' && session.user_id !== actor.id ? 'admin_force_release' : reason
      this.database.run('UPDATE account_sessions SET status = \'ended\', ended_at = ?, release_reason = ? WHERE id = ?', [new Date().toISOString(), releaseReason, sessionId])
      this.addAudit(actor.id, 'SESSION_ENDED', 'account_sessions', sessionId, { releaseReason })
      return { success: true as const }
    })
  }

  saveAccountSessionBlob(actorId: string, accountId: string, sessionBlob: string) {
    this.database.transactionSync(() => {
      const account = this.database.get<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [accountId])
      if (!account) throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
      this.database.run('UPDATE accounts SET session_blob = ?, updated_at = ? WHERE id = ?', [sessionBlob, new Date().toISOString(), accountId])
      this.addAudit(actorId, 'SESSION_BLOB_PROVISIONED', 'accounts', accountId, { accountId })
    })
  }

  getAccountSessionBlob(userId: string, sessionId: string) {
    const session = this.database.get<{ id: string; account_id: string; user_id: string; status: string }>('SELECT id, account_id, user_id, status FROM account_sessions WHERE id = ? AND user_id = ? AND status IN (\'starting\', \'active\')', [sessionId, userId])
    if (!session) throw new ServiceError('SESSION_NOT_FOUND', 404)
    const account = this.database.get<{ session_blob: string | null }>('SELECT session_blob FROM accounts WHERE id = ?', [session.account_id])
    if (!account?.session_blob) throw new ServiceError('SESSION_BLOB_NOT_PROVISIONED', 404, 'No active session token provisioned for this account')
    return account.session_blob
  }

  deleteAccountSessionBlob(actorId: string, accountId: string) {
    this.database.transactionSync(() => {
      const account = this.database.get<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [accountId])
      if (!account) throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
      this.database.run('UPDATE accounts SET session_blob = NULL, updated_at = ? WHERE id = ?', [new Date().toISOString(), accountId])
      this.addAudit(actorId, 'SESSION_BLOB_REVOKED', 'accounts', accountId, { accountId })
    })
  }

  listAudit(limit = 100, offset = 0) {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 500) : 100
    const safeOffset = Number.isFinite(offset) ? Math.min(Math.max(Math.floor(offset), 0), 1_000_000) : 0
    return this.database.all<Record<string, unknown>>(`SELECT l.id, l.action, l.entity_type, l.entity_id, l.payload_json, l.created_at, COALESCE(u.display_name, 'System') AS actor FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`).map((row) => ({ id: String(row.id), action: String(row.action), entityType: String(row.entity_type), entityId: String(row.entity_id), payload: JSON.parse(String(row.payload_json ?? '{}')), createdAt: String(row.created_at), actor: String(row.actor) }))
  }

  recordAudit(actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) {
    this.addAudit(actorId, action, entityType, entityId, payload)
  }

  reapStaleSessions(persist = true) {
    const now = Date.now()
    const cutoff = new Date(now - 90_000).toISOString()
    const stale = this.database.all<{ id: string; user_id: string; account_id: string }>(`SELECT id, user_id, account_id FROM account_sessions WHERE status IN ('starting', 'active') AND last_heartbeat_at < ? AND (reconnect_grace_until IS NULL OR reconnect_grace_until <= ?)`, [cutoff, new Date(now).toISOString()])
    for (const session of stale) {
      this.database.run('UPDATE account_sessions SET status = \'stale\', ended_at = ?, release_reason = \'heartbeat_timeout\' WHERE id = ?', [new Date(now).toISOString(), session.id])
      this.addAudit(session.user_id, 'SESSION_LAZILY_REAPED', 'account_sessions', session.id, { accountId: session.account_id })
    }
    if (persist && stale.length) void this.database.save()
    return stale.length
  }

  private addAudit(actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) {
    this.database.run('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), actorId, action, entityType, entityId, JSON.stringify(payload), new Date().toISOString()])
  }
}
