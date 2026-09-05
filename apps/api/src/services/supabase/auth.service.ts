import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiUser, UserRole } from '@laap/types'
import { ServiceError } from '../service-error.js'
import type { UserLookup } from '../service-port.js'
import type { IAuthService } from '../domain/auth.js'
import { executeQuery, publicUser, type Row } from './shared.js'

export class SupabaseAuthService implements IAuthService {
  constructor(
    private readonly data: SupabaseClient,
    private readonly auth: SupabaseClient
  ) {}

  async roleForUser(userId: string): Promise<UserRole> {
    const row = await executeQuery<Row | null>(
      this.data.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      'ROLE_LOOKUP_FAILED'
    )
    return row?.role === 'admin' ? 'admin' : 'operator'
  }

  async findUserByEmail(email: string) {
    const row = await executeQuery<Row | null>(
      this.data.from('profiles').select('id,email,display_name,status').eq('email', email).maybeSingle(),
      'PROFILE_LOOKUP_FAILED'
    )
    return row
      ? ({
          id: String(row.id),
          email: String(row.email),
          display_name: String(row.display_name),
          status: row.status as ApiUser['status'],
        } satisfies UserLookup)
      : undefined
  }

  async findUserById(id: string) {
    const row = await executeQuery<Row | null>(
      this.data.from('profiles').select('id,email,display_name,status').eq('id', id).maybeSingle(),
      'PROFILE_LOOKUP_FAILED'
    )
    if (!row) return undefined
    const role = await this.roleForUser(id)
    return publicUser({ ...row, role })
  }

  async authenticate(email: string, password: string) {
    const { data, error } = await this.auth.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      throw new ServiceError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect')
    }
    const profile = await this.findUserById(data.user.id)
    if (!profile || profile.status !== 'active') {
      throw new ServiceError('ACCOUNT_DISABLED', 401, 'Account is not active')
    }
    return profile
  }

  async listUsers() {
    const rows = await executeQuery<Row[]>(
      this.data.from('profiles').select('id,email,display_name,status').order('display_name'),
      'PROFILE_LOOKUP_FAILED'
    )
    const roles = await executeQuery<Row[]>(this.data.from('user_roles').select('user_id,role'))
    const roleMap = new Map(roles.map((r) => [String(r.user_id), r.role === 'admin' ? 'admin' : 'operator']))
    return rows.map((row) => publicUser({ ...row, role: roleMap.get(String(row.id)) ?? 'operator' }))
  }

  async createUser(
    actorId: string,
    input: { email: string; displayName: string; password: string; role: 'admin' | 'operator' }
  ): Promise<ApiUser> {
    const { data, error } = await this.data.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { display_name: input.displayName },
      app_metadata: { role: input.role },
    })
    if (error || !data.user) {
      throw new ServiceError('USER_CREATE_FAILED', 400, error?.message ?? 'Could not create auth user')
    }
    try {
      await executeQuery(
        this.data
          .from('profiles')
          .upsert({ id: data.user.id, email: input.email, display_name: input.displayName, status: 'active' }),
        'PROFILE_CREATE_FAILED'
      )
      await executeQuery(
        this.data.from('user_roles').upsert({ user_id: data.user.id, role: input.role }),
        'ROLE_ASSIGN_FAILED'
      )
    } catch (cause) {
      await this.data.auth.admin.deleteUser(data.user.id).catch(() => undefined)
      throw cause
    }
    await this.recordAudit(actorId, 'USER_CREATED', 'users', data.user.id, { email: input.email, role: input.role })
    return { id: data.user.id, email: input.email, displayName: input.displayName, role: input.role, status: 'active' }
  }

  async updateUser(actorId: string, userId: string, input: { displayName?: string; role?: 'admin' | 'operator'; status?: ApiUser['status'] }) {
    const current = await this.findUserById(userId)
    if (!current) throw new ServiceError('USER_NOT_FOUND', 404)
    if (actorId === userId && input.status && input.status !== 'active') throw new ServiceError('SELF_LOCKOUT', 409)
    if (
      current.role === 'admin' &&
      current.status === 'active' &&
      (input.role === 'operator' || (input.status !== undefined && input.status !== 'active'))
    ) {
      const admins = await executeQuery<Row[]>(this.data.from('profiles').select('id,user_roles!inner(role)').eq('status', 'active').eq('user_roles.role', 'admin'), 'ROLE_LOOKUP_FAILED')
      if (admins.length <= 1) throw new ServiceError('LAST_ADMIN_REQUIRED', 409)
    }
    const profilePatch: Row = {}
    if (input.displayName !== undefined) profilePatch.display_name = input.displayName
    if (input.status !== undefined) profilePatch.status = input.status
    if (Object.keys(profilePatch).length) await executeQuery(this.data.from('profiles').update(profilePatch).eq('id', userId), 'PROFILE_UPDATE_FAILED')
    if (input.role !== undefined) {
      await executeQuery(this.data.from('user_roles').upsert({ user_id: userId, role: input.role }), 'ROLE_UPDATE_FAILED')
      const { error } = await this.data.auth.admin.updateUserById(userId, { app_metadata: { role: input.role } })
      if (error) throw new ServiceError('ROLE_UPDATE_FAILED', 400, error.message)
    }
    if (input.status && input.status !== 'active') {
      const sessions = await executeQuery<Row[]>(
        this.data.from('account_sessions').select('id,account_id').eq('user_id', userId).in('status', ['starting', 'active', 'stopping']),
        'SESSION_LOOKUP_FAILED'
      )
      if (sessions.length) {
        await executeQuery(
          this.data
            .from('account_sessions')
            .update({ status: 'ended', runtime_state: 'EXITED', ended_at: new Date().toISOString(), release_reason: 'error' })
            .in('id', sessions.map((session) => String(session.id))),
          'SESSION_REVOKE_FAILED'
        )
        for (const session of sessions) {
          await this.recordAudit(actorId, 'SESSION_ENDED', 'account_sessions', String(session.id), { accountId: String(session.account_id), releaseReason: 'user_deactivated' })
        }
      }
    }
    await this.recordAudit(actorId, 'USER_UPDATED', 'users', userId, { fields: Object.keys({ ...profilePatch, role: input.role }).filter((key) => key !== 'role' || input.role !== undefined) })
    return (await this.findUserById(userId))!
  }

  async resetUserPassword(actorId: string, userId: string, password: string) {
    const current = await this.findUserById(userId)
    if (!current) throw new ServiceError('USER_NOT_FOUND', 404)
    const { error } = await this.data.auth.admin.updateUserById(userId, { password })
    if (error) throw new ServiceError('PASSWORD_RESET_FAILED', 400, error.message)
    await this.recordAudit(actorId, 'USER_PASSWORD_RESET', 'users', userId, {})
  }

  private async recordAudit(actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) {
    await executeQuery(this.data.from('audit_logs').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, payload }), 'AUDIT_INSERT_FAILED')
  }
}
