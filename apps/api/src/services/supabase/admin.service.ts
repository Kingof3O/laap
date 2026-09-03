import type { SupabaseClient } from '@supabase/supabase-js'
import type { DashboardActivity, DashboardMetrics, DashboardSession, DashboardSnapshot } from '@laap/types'
import type { AssignmentView, AuditView } from '../service-port.js'
import { ServiceError } from '../service-error.js'
import type { IAdminService } from '../domain/admin.js'
import type { IAuthService } from '../domain/auth.js'
import type { IAccountService } from '../domain/accounts.js'
import type { ILeaseService } from '../domain/leases.js'
import { activeStatuses, executeQuery, initials, relativeTime, toneFor, type Row } from './shared.js'

export class SupabaseAdminService implements IAdminService {
  constructor(
    private readonly data: SupabaseClient,
    private readonly authService: IAuthService,
    private readonly accountService: IAccountService,
    private readonly leaseService: ILeaseService
  ) {}

  async listAssignments() {
    const rows = await executeQuery<Row[]>(
      this.data
        .from('account_assignments')
        .select('id,account_id,user_id,status,assigned_at,expires_at,accounts(display_name),profiles(display_name,email)')
        .order('assigned_at', { ascending: false }),
      'ASSIGNMENTS_LOOKUP_FAILED'
    )
    return rows.map((row) => ({
      id: String(row.id),
      accountId: String(row.account_id),
      userId: String(row.user_id),
      account: String((row.accounts as Row | undefined)?.display_name ?? 'Unknown'),
      user: String((row.profiles as Row | undefined)?.display_name ?? 'Unknown'),
      email: String((row.profiles as Row | undefined)?.email ?? ''),
      status: String(row.status),
      assignedAt: String(row.assigned_at),
      expiresAt: row.expires_at ? String(row.expires_at) : null,
    })) satisfies AssignmentView[]
  }

  async addAssignment(_actorId: string, accountId: string, userId: string, expiresAt: string | null) {
    const inserted = await executeQuery<Row>(
      this.data
        .from('account_assignments')
        .upsert({ account_id: accountId, user_id: userId, status: 'active', expires_at: expiresAt, assigned_at: new Date().toISOString() })
        .select('id')
        .single(),
      'ASSIGNMENT_UPSERT_FAILED'
    )
    return String(inserted.id)
  }

  async revokeAssignment(_actorId: string, accountId: string, userId: string) {
    await executeQuery(
      this.data.from('account_assignments').update({ status: 'revoked' }).eq('account_id', accountId).eq('user_id', userId),
      'ASSIGNMENT_REVOKE_FAILED'
    )
  }

  async listAudit(limit = 100, offset = 0) {
    const rows = await executeQuery<Row[]>(
      this.data
        .from('audit_logs')
        .select('id,action,entity_type,entity_id,payload_json,created_at,profiles(display_name)')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
      'AUDIT_LOOKUP_FAILED'
    )
    return rows.map((row) => ({
      id: String(row.id),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      payload: (row.payload_json ?? {}) as Record<string, unknown>,
      createdAt: String(row.created_at),
      actor: String((row.profiles as Row | undefined)?.display_name ?? 'System'),
    })) satisfies AuditView[]
  }

  async recordAudit(actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) {
    await executeQuery(
      this.data.from('audit_logs').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, payload_json: payload }),
      'AUDIT_INSERT_FAILED'
    )
  }

  async getDashboard(userId: string): Promise<DashboardSnapshot> {
    await this.leaseService.reapStaleSessions()
    const user = await this.authService.findUserById(userId)
    if (!user) throw new ServiceError('USER_NOT_FOUND', 404)
    const scoped = user.role === 'admin' ? undefined : user.id
    return {
      user,
      metrics: await this.getMetrics(scoped),
      sessions: await this.listSessions(scoped),
      activity: await this.listActivity(scoped),
      accounts: await this.accountService.listAccounts(scoped),
    }
  }

  async getMetrics(userId?: string): Promise<DashboardMetrics> {
    const accounts = await this.accountService.listAccounts(userId)
    const sessions = await this.listSessions(userId)
    const devices = await executeQuery<Row[]>(
      userId ? this.data.from('user_devices').select('id,last_seen_at').eq('user_id', userId).eq('status', 'active') : this.data.from('user_devices').select('id,last_seen_at').eq('status', 'active')
    )
    const cutoff = Date.now() - 5 * 60_000
    const healthyDevices = devices.filter((d) => new Date(String(d.last_seen_at)).getTime() > cutoff).length
    const userCount = userId ? 1 : (await executeQuery<Row[]>(this.data.from('profiles').select('id').eq('status', 'active'))).length
    return {
      availableAccounts: accounts.filter((a) => a.status === 'Available').length,
      totalAccounts: accounts.length,
      activeLeases: sessions.length,
      boundDevices: devices.length,
      healthyDevices,
      authorizedUsers: userCount,
      activeUsers: userCount,
    }
  }

  async listSessions(userId?: string): Promise<DashboardSession[]> {
    let query = this.data
      .from('account_sessions')
      .select('id,account_id,user_id,status,started_at,accounts(display_name,region),profiles(display_name),user_devices(device_name,platform)')
      .in('status', activeStatuses)
    if (userId) query = query.eq('user_id', userId)
    const rows = await executeQuery<Row[]>(query.order('started_at', { ascending: false }), 'SESSIONS_LOOKUP_FAILED')
    return rows.map((row) => {
      const account = (row.accounts as Row | undefined) ?? {}
      const user = (row.profiles as Row | undefined) ?? {}
      const device = (row.user_devices as Row | undefined) ?? {}
      const userName = String(user.display_name ?? 'Operator')
      return {
        id: String(row.id),
        account: String(account.display_name ?? 'Account'),
        region: String(account.region ?? 'EUW'),
        user: userName,
        initials: initials(userName),
        device: `${String(device.device_name ?? 'Device')} · ${device.platform === 'macos' ? 'macOS' : 'Windows'}`,
        status: row.status as DashboardSession['status'],
        started: relativeTime(String(row.started_at)),
        avatarTone: toneFor(String(row.user_id)),
      }
    })
  }

  async listActivity(userId?: string): Promise<DashboardActivity[]> {
    let query = this.data.from('audit_logs').select('id,action,payload_json,created_at,profiles(display_name)').order('created_at', { ascending: false }).limit(6)
    if (userId) query = query.eq('actor_id', userId)
    const rows = await executeQuery<Row[]>(query, 'ACTIVITY_LOOKUP_FAILED')
    return rows.map((row, index) => {
      const payload = (row.payload_json ?? {}) as { account?: string }
      const action = String(row.action)
      const actionMap: Record<string, { title: string; tone: DashboardActivity['tone'] }> = {
        SESSION_STARTED: { title: 'Lease acquired', tone: 'success' },
        SESSION_ENDED: { title: 'Lease released', tone: 'neutral' },
        DEVICE_REGISTERED: { title: 'Device registered', tone: 'info' },
        ASSIGNMENT_UPDATED: { title: 'Assignment updated', tone: 'neutral' },
        ASSIGNMENT_REVOKED: { title: 'Assignment revoked', tone: 'warning' },
        SESSION_LAZILY_REAPED: { title: 'Stale session reaped', tone: 'warning' },
      }
      const mapped = actionMap[action] ?? { title: action.replaceAll('_', ' ').toLowerCase(), tone: 'neutral' as const }
      const actor = String((row.profiles as Row | undefined)?.display_name ?? 'System')
      const detail = payload.account ? `${payload.account} · ${actor}` : `${actor} · ${action.toLowerCase().replaceAll('_', ' ')}`
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
