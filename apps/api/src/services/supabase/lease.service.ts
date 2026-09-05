import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiUser, SessionRuntimeState } from '@laap/types'
import { releaseLeaseSchema } from '@laap/validation'
import { ServiceError } from '../service-error.js'
import type { ILeaseService } from '../domain/leases.js'
import { executeQuery, type Row } from './shared.js'

export class SupabaseLeaseService implements ILeaseService {
  constructor(private readonly data: SupabaseClient) {}

  async acquireLease(userId: string, accountId: string, deviceId: string, options: { nonce?: string; signature?: string } = {}) {
    const result = await executeQuery<unknown>(
      this.data.rpc('acquire_account_lease_for_user', {
        p_user_id: userId,
        p_account_id: accountId,
        p_device_id: deviceId,
        p_nonce: options.nonce ?? null,
        p_signature: options.signature ?? null,
      }),
      'LEASE_ACQUIRE_FAILED'
    )
    const payload = result as Row
    if (!payload.success) {
      const code = String(payload.code ?? 'LEASE_ACQUIRE_FAILED')
      throw new ServiceError(code, code === 'ACCOUNT_BUSY' ? 409 : 403)
    }
    return { success: true as const, sessionId: String(payload.session_id), isReconnect: Boolean(payload.is_reconnect) }
  }

  async heartbeatLease(userId: string, sessionId: string, runtimeState: SessionRuntimeState) {
    const result = await executeQuery<unknown>(
      this.data.rpc('heartbeat_account_session_for_user', {
        p_user_id: userId,
        p_session_id: sessionId,
        p_runtime_state: runtimeState,
      }),
      'SESSION_HEARTBEAT_FAILED'
    )
    const payload = result as Row
    if (!payload.success) {
      const code = String(payload.code ?? 'SESSION_NOT_FOUND')
      throw new ServiceError(code, code === 'ASSIGNMENT_EXPIRED' || code === 'DEVICE_NOT_AUTHORIZED' ? 403 : 404)
    }
    return { success: true as const }
  }

  async releaseLease(actor: ApiUser, sessionId: string, reason: string) {
    const parsed = releaseLeaseSchema.safeParse({ sessionId, reason })
    if (!parsed.success) throw new ServiceError('INVALID_RELEASE_REASON', 400)
    const result = await executeQuery<unknown>(
      this.data.rpc('release_account_lease_for_user', {
        p_actor_id: actor.id,
        p_session_id: sessionId,
        p_reason: reason,
        p_is_admin: actor.role === 'admin',
      }),
      'LEASE_RELEASE_FAILED'
    )
    const payload = result as Row
    if (!payload.success) throw new ServiceError(String(payload.code ?? 'LEASE_RELEASE_FAILED'), payload.code === 'FORBIDDEN' ? 403 : 404)
    return { success: true as const }
  }

  async forceReleaseAccount(actor: ApiUser, accountId: string) {
    if (actor.role !== 'admin') throw new ServiceError('FORBIDDEN', 403)
    const sessions = await executeQuery<Row[]>(
      this.data.from('account_sessions').select('id').eq('account_id', accountId).in('status', ['starting', 'active', 'stopping']),
      'SESSION_LOOKUP_FAILED'
    )
    for (const session of sessions) {
      const result = await executeQuery<unknown>(
        this.data.rpc('release_account_lease_for_user', {
          p_actor_id: actor.id,
          p_session_id: String(session.id),
          p_reason: 'admin_force_release',
          p_is_admin: true,
        }),
        'LEASE_RELEASE_FAILED'
      )
      const payload = result as Row
      if (!payload.success) throw new ServiceError(String(payload.code ?? 'LEASE_RELEASE_FAILED'), 409)
    }
    return { success: true as const }
  }

  async reapStaleSessions() {
    const result = await executeQuery<unknown>(this.data.rpc('reap_stale_account_sessions'), 'REAPER_FAILED')
    return Number(result ?? 0)
  }
}
