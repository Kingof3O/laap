import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { ApiUser } from '@laap/types'
import type { AppDatabase } from '../../db/database.js'
import { ServiceError } from '../service-error.js'
import type { IAuthService } from '../domain/auth.js'
import { publicUser, type UserRow } from './shared.js'

export class SqliteAuthService implements IAuthService {
  constructor(
    private readonly database: AppDatabase,
    private readonly addAuditFn: (actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) => void
  ) {}

  findUserByEmail(email: string) {
    return this.database.get<UserRow>(
      'SELECT id, email, password_hash, display_name, role, status FROM users WHERE lower(email) = lower(?)',
      [email]
    )
  }

  findUserById(id: string) {
    const row = this.database.get<UserRow>(
      'SELECT id, email, password_hash, display_name, role, status FROM users WHERE id = ?',
      [id]
    )
    return row ? publicUser(row) : undefined
  }

  async authenticate(email: string, password: string) {
    const user = this.findUserByEmail(email)
    if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.password_hash))) {
      throw new ServiceError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect')
    }
    return publicUser(user)
  }

  listUsers() {
    return this.database
      .all<UserRow>('SELECT id, email, password_hash, display_name, role, status FROM users ORDER BY display_name')
      .map(publicUser)
  }

  async createUser(
    actorId: string,
    input: { email: string; displayName: string; password: string; role: 'admin' | 'operator' }
  ) {
    const existing = this.database.get<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = lower(?)',
      [input.email]
    )
    if (existing) throw new ServiceError('USER_EXISTS', 409, 'A user with this email already exists')
    const id = randomUUID()
    const timestamp = new Date().toISOString()
    const passwordHash = await bcrypt.hash(input.password, 12)
    this.database.transactionSync(() => {
      this.database.run(
        'INSERT INTO users (id, email, password_hash, display_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, input.email.toLowerCase(), passwordHash, input.displayName, input.role, 'active', timestamp, timestamp]
      )
      this.addAuditFn(actorId, 'USER_CREATED', 'users', id, {
        email: input.email.toLowerCase(),
        role: input.role,
      })
    })
    return {
      id,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      role: input.role,
      status: 'active',
    } as ApiUser
  }

  updateUser(actorId: string, userId: string, input: { displayName?: string; role?: 'admin' | 'operator'; status?: ApiUser['status'] }) {
    return this.database.transactionSync(() => {
      const current = this.database.get<{ id: string; role: string; status: ApiUser['status'] }>('SELECT id, role, status FROM users WHERE id = ?', [userId])
      if (!current) throw new ServiceError('USER_NOT_FOUND', 404)
      if (actorId === userId && input.status && input.status !== 'active') throw new ServiceError('SELF_LOCKOUT', 409)
      if (
        current.role === 'admin' &&
        current.status === 'active' &&
        (input.role === 'operator' || (input.status !== undefined && input.status !== 'active'))
      ) {
        const admins = this.database.get<{ count: number }>(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'`)
        if (Number(admins?.count ?? 0) <= 1) throw new ServiceError('LAST_ADMIN_REQUIRED', 409)
      }
      const fields: Array<[string, string]> = []
      if (input.displayName !== undefined) fields.push(['display_name', input.displayName])
      if (input.role !== undefined) fields.push(['role', input.role])
      if (input.status !== undefined) fields.push(['status', input.status])
      if (fields.length) {
        this.database.run(`UPDATE users SET ${fields.map(([name]) => `${name} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...fields.map(([, value]) => value), new Date().toISOString(), userId])
      }
      if (input.status && input.status !== 'active') {
        const sessions = this.database.all<{ id: string; account_id: string }>(
          `SELECT id, account_id FROM account_sessions WHERE user_id = ? AND status IN ('starting', 'active', 'stopping')`,
          [userId]
        )
        const endedAt = new Date().toISOString()
        for (const session of sessions) {
          this.database.run(
            `UPDATE account_sessions SET status = 'ended', runtime_state = 'EXITED', ended_at = ?, release_reason = 'error' WHERE id = ?`,
            [endedAt, session.id]
          )
          this.addAuditFn(actorId, 'SESSION_ENDED', 'account_sessions', session.id, { accountId: session.account_id, releaseReason: 'user_deactivated' })
        }
      }
      this.addAuditFn(actorId, 'USER_UPDATED', 'users', userId, { fields: fields.map(([name]) => name) })
      return this.findUserById(userId)!
    })
  }

  async resetUserPassword(actorId: string, userId: string, password: string) {
    const user = this.database.get<{ id: string }>('SELECT id FROM users WHERE id = ?', [userId])
    if (!user) throw new ServiceError('USER_NOT_FOUND', 404)
    const passwordHash = await bcrypt.hash(password, 12)
    this.database.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [passwordHash, new Date().toISOString(), userId])
    this.addAuditFn(actorId, 'USER_PASSWORD_RESET', 'users', userId, {})
  }
}
