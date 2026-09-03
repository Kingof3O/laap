import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiUser } from '@laap/types'
import { releaseLeaseSchema } from '@laap/validation'
import { ServiceError } from '../service-error.js'
import type { ILeaseService } from '../domain/leases.js'
import { activeStatuses, executeQuery, type Row } from './shared.js'

export class SupabaseLeaseService implements ILeaseService {
  constructor(private readonly data: SupabaseClient) {}

  async acquireLease(
    userId: string,
    accountId: string,
    deviceId: string,
    _options: { nonce?: string; signature?: string } = {}
  ) {
    const roleRow = await executeQuery<Row | null>(
      this.data.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
    )
    const isAdmin = roleRow?.role === 'admin'
    if (!isAdmin) {
      const assignment = await executeQuery<Row | null>(
        this.data
          .from('account_assignments')
          .select('id, expires_at')
          .eq('account_id', accountId)
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle()
      )
      if (!assignment || (assignment.expires_at && new Date(String(assignment.expires_at)).getTime() <= Date.now())) {
        throw new ServiceError('NO_ACTIVE_ASSIGNMENT', 403)
      }
    }

    const device = await executeQuery<Row | null>(
      this.data.from('user_devices').select('id').eq('id', deviceId).eq('user_id', userId).eq('status', 'active').maybeSingle()
    )
    if (!device) throw new ServiceError('DEVICE_NOT_AUTHORIZED', 403)

    const account = await executeQuery<Row | null>(
      this.data.from('accounts').select('id, status').eq('id', accountId).maybeSingle()
    )
    if (!account || account.status !== 'available') throw new ServiceError('ACCOUNT_UNAVAILABLE', 409)

    const active = await executeQuery<Row[]>(
      this.data.from('account_sessions').select('id, user_id, device_id, started_at').eq('account_id', accountId).in('status', activeStatuses)
    )
    if (active.length) {
      const current = active[0]
      if (new Date(String(current.started_at)).getTime() < Date.now() - 4 * 3600_000) {
        await executeQuery(
          this.data
            .from('account_sessions')
            .update({ status: 'stale', ended_at: new Date().toISOString(), release_reason: 'lease_timeout' })
            .eq('id', current.id)
        )
      } else if (current.user_id === userId && current.device_id === deviceId) {
        return { success: true as const, sessionId: String(current.id), isReconnect: true }
      } else {
        throw new ServiceError('ACCOUNT_BUSY', 409)
      }
    }

    const timestamp = new Date().toISOString()
    const inserted = await executeQuery<Row>(
      this.data
        .from('account_sessions')
        .insert({
          account_id: accountId,
          user_id: userId,
          device_id: deviceId,
          status: 'active',
          runtime_state: 'LAUNCHING',
          started_at: timestamp,
          last_heartbeat_at: timestamp,
        })
        .select('id')
        .single(),
      'SESSION_CREATE_FAILED'
    )
    return { success: true as const, sessionId: String(inserted.id), isReconnect: false }
  }

  async releaseLease(actor: ApiUser, sessionId: string, reason: string) {
    const parsed = releaseLeaseSchema.safeParse({ sessionId, reason })
    if (!parsed.success) throw new ServiceError('INVALID_RELEASE_REASON', 400)
    const session = await executeQuery<Row | null>(
      this.data.from('account_sessions').select('id, user_id').eq('id', sessionId).maybeSingle()
    )
    if (!session) throw new ServiceError('SESSION_NOT_FOUND', 404)
    if (session.user_id !== actor.id && actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 403)
    const releaseReason = actor.role === 'admin' && session.user_id !== actor.id ? 'admin_force_release' : reason
    await executeQuery(
      this.data
        .from('account_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString(), release_reason: releaseReason })
        .eq('id', sessionId),
      'SESSION_UPDATE_FAILED'
    )
    return { success: true as const }
  }

  async reapStaleSessions() {
    const cutoff = new Date(Date.now() - 90_000).toISOString()
    const stale = await executeQuery<Row[]>(
      this.data
        .from('account_sessions')
        .select('id')
        .in('status', ['starting', 'active'])
        .lt('last_heartbeat_at', cutoff)
    )
    if (stale.length) {
      await executeQuery(
        this.data
          .from('account_sessions')
          .update({ status: 'stale', ended_at: new Date().toISOString(), release_reason: 'heartbeat_timeout' })
          .in('id', stale.map((s) => s.id))
      )
    }
    return stale.length
  }
}
