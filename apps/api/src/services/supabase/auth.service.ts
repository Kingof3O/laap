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
    })
    if (error || !data.user) {
      throw new ServiceError('USER_CREATE_FAILED', 400, error?.message ?? 'Could not create auth user')
    }
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
    return { id: data.user.id, email: input.email, displayName: input.displayName, role: input.role, status: 'active' }
  }
}
