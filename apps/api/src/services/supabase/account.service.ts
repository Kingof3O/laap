import type { SupabaseClient } from '@supabase/supabase-js'
import type { DashboardAccount } from '@laap/types'
import { ServiceError } from '../service-error.js'
import { decryptSecret, encryptSecret } from '../secret-box.js'
import type { IAccountService } from '../domain/accounts.js'
import { accentFor, activeStatuses, executeQuery, relativeTime, type Row } from './shared.js'

export class SupabaseAccountService implements IAccountService {
  constructor(private readonly data: SupabaseClient, private readonly vaultKey: string) {}

  async listAccounts(userId?: string) {
    let query = this.data
      .from('accounts')
      .select('id,external_id,display_name,region,status,metadata,session_blob,updated_at,account_sessions(id,status,started_at,profiles(display_name),user_devices(device_name))')
    if (userId) {
      const allowed = await executeQuery<Row[]>(
        this.data.from('account_assignments').select('account_id,expires_at').eq('user_id', userId).eq('status', 'active')
      )
      const now = Date.now()
      const allowedIds = allowed.filter((row) => !row.expires_at || new Date(String(row.expires_at)).getTime() > now).map((row) => String(row.account_id))
      if (!allowedIds.length) return []
      query = query.in('id', allowedIds)
    }
    const rows = await executeQuery<Row[]>(query.order('display_name'), 'ACCOUNTS_LOOKUP_FAILED')
    return rows.map((row, index) => {
      const metadata = (row.metadata ?? {}) as { level?: number }
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
        externalId: String(row.external_id),
        region: String(row.region),
        status,
        lastUsed: relativeTime(String(activeSession?.started_at ?? row.updated_at ?? new Date().toISOString())),
        level: metadata.level ?? 120 + (index % 170),
        accent: accentFor(String(row.id)),
        hasSessionBlob: Boolean(row.session_blob),
        activeUser: activeSession?.profiles ? String((activeSession.profiles as Row).display_name ?? '') || undefined : undefined,
        activeDevice: activeSession?.user_devices ? String((activeSession.user_devices as Row).device_name ?? '') || undefined : undefined,
        sessionStarted: activeSession?.started_at ? String(activeSession.started_at) : undefined,
      }
    })
  }

  async createAccount(
    actorId: string,
    input: { displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }
  ) {
    const duplicate = await executeQuery<Row | null>(
      this.data.from('accounts').select('id').eq('external_id', input.externalId).maybeSingle(),
      'ACCOUNT_LOOKUP_FAILED'
    )
    if (duplicate) throw new ServiceError('ACCOUNT_EXISTS', 409)
    const row = await executeQuery<Row>(
      this.data
        .from('accounts')
        .insert({
          display_name: input.displayName,
          external_id: input.externalId,
          region: input.region,
          status: input.status,
          provider: 'riot',
          metadata: {},
        })
        .select('id')
        .single(),
      'ACCOUNT_CREATE_FAILED'
    )
    await this.recordAudit(actorId, 'ACCOUNT_CREATED', 'accounts', String(row.id), { displayName: input.displayName, region: input.region })
    return String(row.id)
  }

  async updateAccount(
    actorId: string,
    accountId: string,
    input: Partial<{ displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }>
  ) {
    const current = await executeQuery<Row | null>(
      this.data.from('accounts').select('id,status').eq('id', accountId).maybeSingle(),
      'ACCOUNT_LOOKUP_FAILED'
    )
    if (!current) throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
    const payload: Row = {}
    if (input.displayName) payload.display_name = input.displayName
    if (input.externalId) payload.external_id = input.externalId
    if (input.region) payload.region = input.region
    if (input.status) payload.status = input.status
    if (Object.keys(payload).length) {
      if (input.externalId) {
        const duplicate = await executeQuery<Row | null>(
          this.data.from('accounts').select('id').eq('external_id', input.externalId).neq('id', accountId).maybeSingle(),
          'ACCOUNT_LOOKUP_FAILED'
        )
        if (duplicate) throw new ServiceError('ACCOUNT_EXISTS', 409)
      }
      if (input.status && input.status !== 'available') {
        if (String(current.status) !== input.status) {
          const active = await executeQuery<Row[]>(
            this.data.from('account_sessions').select('id').eq('account_id', accountId).in('status', activeStatuses),
            'SESSION_LOOKUP_FAILED'
          )
          if (active.length) throw new ServiceError('ACCOUNT_BUSY', 409)
        }
      }
      await executeQuery(this.data.from('accounts').update(payload).eq('id', accountId), 'ACCOUNT_UPDATE_FAILED')
      await this.recordAudit(actorId, 'ACCOUNT_UPDATED', 'accounts', accountId, { fields: Object.keys(payload) })
    }
  }

  async deleteAccount(actorId: string, accountId: string) {
    const account = await executeQuery<Row | null>(this.data.from('accounts').select('id').eq('id', accountId).maybeSingle(), 'ACCOUNT_LOOKUP_FAILED')
    if (!account) throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
    const active = await executeQuery<Row[]>(
      this.data.from('account_sessions').select('id').eq('account_id', accountId).in('status', activeStatuses)
    )
    if (active.length) throw new ServiceError('ACCOUNT_BUSY', 409)
    await executeQuery(this.data.from('accounts').delete().eq('id', accountId), 'ACCOUNT_DELETE_FAILED')
    await this.recordAudit(actorId, 'ACCOUNT_DELETED', 'accounts', accountId, {})
  }

  async saveAccountSessionBlob(actorId: string, accountId: string, sessionBlob: string) {
    const account = await executeQuery<Row | null>(this.data.from('accounts').select('id').eq('id', accountId).maybeSingle(), 'ACCOUNT_LOOKUP_FAILED')
    if (!account) throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
    await executeQuery(
      this.data.from('accounts').update({ session_blob: encryptSecret(sessionBlob, this.vaultKey, `account:${accountId}`) }).eq('id', accountId),
      'ACCOUNT_UPDATE_FAILED'
    )
    await this.recordAudit(actorId, 'SESSION_BLOB_UPDATED', 'accounts', accountId, {})
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
    const stored = String(account.session_blob)
    const decrypted = decryptSecret(stored, this.vaultKey, `account:${String(session.account_id)}`)
    if (decrypted.legacyPlaintext) {
      await executeQuery(
        this.data.from('accounts').update({ session_blob: encryptSecret(decrypted.value, this.vaultKey, `account:${String(session.account_id)}`) }).eq('id', session.account_id),
        'ACCOUNT_UPDATE_FAILED'
      )
    }
    return decrypted.value
  }

  async deleteAccountSessionBlob(actorId: string, accountId: string) {
    const account = await executeQuery<Row | null>(this.data.from('accounts').select('id').eq('id', accountId).maybeSingle(), 'ACCOUNT_LOOKUP_FAILED')
    if (!account) throw new ServiceError('ACCOUNT_NOT_FOUND', 404)
    await executeQuery(
      this.data.from('accounts').update({ session_blob: null }).eq('id', accountId),
      'ACCOUNT_UPDATE_FAILED'
    )
    await this.recordAudit(actorId, 'SESSION_BLOB_DELETED', 'accounts', accountId, {})
  }

  private async recordAudit(actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) {
    await executeQuery(this.data.from('audit_logs').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, payload }), 'AUDIT_INSERT_FAILED')
  }
}
