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
}
