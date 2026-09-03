import type { SupabaseClient } from '@supabase/supabase-js'
import type { DashboardAccount } from '@laap/types'
import { ServiceError } from '../service-error.js'
import type { IAccountService } from '../domain/accounts.js'
import { accentFor, activeStatuses, executeQuery, relativeTime, type Row } from './shared.js'

export class SupabaseAccountService implements IAccountService {
  constructor(private readonly data: SupabaseClient) {}

  async listAccounts(userId?: string) {
    let query = this.data
      .from('accounts')
      .select('id,display_name,region,status,metadata_json,session_blob,updated_at,account_sessions(id,status,started_at)')
    if (userId) {
      const allowed = await executeQuery<Row[]>(
        this.data.from('account_assignments').select('account_id').eq('user_id', userId).eq('status', 'active')
      )
      const allowedIds = allowed.map((row) => String(row.account_id))
      if (!allowedIds.length) return []
      query = query.in('id', allowedIds)
    }
    const rows = await executeQuery<Row[]>(query.order('display_name'), 'ACCOUNTS_LOOKUP_FAILED')
    return rows.map((row, index) => {
      const metadata = (row.metadata_json ?? {}) as { level?: number }
      const sessions = Array.isArray(row.account_sessions) ? (row.account_sessions as Row[]) : []
      const activeSession = sessions.find((s) => activeStatuses.includes(String(s.status)))
      const dbStatus = String(row.status)
      const status: DashboardAccount['status'] =
        dbStatus === 'maintenance'
          ? 'Maintenance'
          : dbStatus === 'disabled'
            ? 'Disabled'
            : activeSession
              ? 'Leased'
              : 'Available'
      return {
        id: String(row.id),
        name: String(row.display_name),
        region: String(row.region),
        status,
        lastUsed: relativeTime(String(activeSession?.started_at ?? row.updated_at ?? new Date().toISOString())),
        level: metadata.level ?? 120 + (index % 170),
        accent: accentFor(String(row.id)),
        hasSessionBlob: Boolean(row.session_blob),
      }
    })
  }

  async createAccount(
    _actorId: string,
    input: { displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }
  ) {
    const row = await executeQuery<Row>(
      this.data
        .from('accounts')
        .insert({
          display_name: input.displayName,
          external_id: input.externalId,
          region: input.region,
          status: input.status,
          provider: 'riot',
          metadata_json: {},
        })
        .select('id')
        .single(),
      'ACCOUNT_CREATE_FAILED'
    )
    return String(row.id)
  }

  async updateAccount(
    _actorId: string,
    accountId: string,
    input: Partial<{ displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }>
  ) {
    const payload: Row = {}
    if (input.displayName) payload.display_name = input.displayName
    if (input.externalId) payload.external_id = input.externalId
    if (input.region) payload.region = input.region
    if (input.status) payload.status = input.status
    if (Object.keys(payload).length) {
      await executeQuery(this.data.from('accounts').update(payload).eq('id', accountId), 'ACCOUNT_UPDATE_FAILED')
    }
  }

  async deleteAccount(_actorId: string, accountId: string) {
    const active = await executeQuery<Row[]>(
      this.data.from('account_sessions').select('id').eq('account_id', accountId).in('status', activeStatuses)
    )
    if (active.length) throw new ServiceError('ACCOUNT_BUSY', 409)
    await executeQuery(this.data.from('accounts').delete().eq('id', accountId), 'ACCOUNT_DELETE_FAILED')
  }

  async saveAccountSessionBlob(_actorId: string, accountId: string, sessionBlob: string) {
    await executeQuery(
      this.data.from('accounts').update({ session_blob: sessionBlob }).eq('id', accountId),
      'ACCOUNT_UPDATE_FAILED'
    )
  }

  async getAccountSessionBlob(userId: string, sessionId: string) {
    const session = await executeQuery<Row | null>(
      this.data
        .from('account_sessions')
        .select('account_id, user_id, status')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .in('status', ['starting', 'active'])
        .maybeSingle(),
      'SESSION_NOT_FOUND'
    )
    if (!session) throw new ServiceError('SESSION_NOT_FOUND', 404)
    const account = await executeQuery<Row | null>(
      this.data.from('accounts').select('session_blob').eq('id', session.account_id).maybeSingle(),
      'ACCOUNT_NOT_FOUND'
    )
    if (!account?.session_blob) {
      throw new ServiceError('SESSION_BLOB_NOT_PROVISIONED', 404, 'No active session token provisioned for this account')
    }
    return String(account.session_blob)
  }

  async deleteAccountSessionBlob(_actorId: string, accountId: string) {
    await executeQuery(
      this.data.from('accounts').update({ session_blob: null }).eq('id', accountId),
      'ACCOUNT_UPDATE_FAILED'
    )
  }
}
