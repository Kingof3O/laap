import { createPublicKey, verify as verifySignature } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ApiUser, DashboardAccount, DashboardActivity, DashboardMetrics, DashboardSession, DashboardSnapshot, SessionState, UserRole } from '@laap/types'
import { releaseLeaseSchema } from '@laap/validation'
import { ServiceError } from './service-error.js'
import type { AssignmentView, AuditView, DeviceView, LaapServicePort, UserLookup } from './service-port.js'
import type { CredentialVaultPort } from './credential-vault.js'

const activeStatuses = ['starting', 'active', 'stopping']
const avatarTones: DashboardSession['avatarTone'][] = ['violet', 'cyan', 'amber', 'rose']
const accountAccents: DashboardAccount['accent'][] = ['violet', 'cyan', 'orange', 'lime', 'rose']

type Row = Record<string, unknown>

function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() }
function relativeTime(iso: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000)); if (seconds < 60) return `${seconds} sec ago`; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes} min ago`; const hours = Math.floor(minutes / 60); return `${hours}h ${String(minutes % 60).padStart(2, '0')}m ago` }
function toneFor(id: string) { return avatarTones[id.charCodeAt(0) % avatarTones.length] }
function accentFor(id: string) { return accountAccents[id.charCodeAt(0) % accountAccents.length] }
function publicUser(row: Row): ApiUser { return { id: String(row.id), email: String(row.email), displayName: String(row.display_name), role: (row.role === 'admin' ? 'admin' : 'operator') as UserRole, status: (row.status as ApiUser['status']) ?? 'active' } }

export type SupabaseRuntime = { url: string; anonKey: string; serviceRoleKey: string }

export class SupabaseLaapService implements LaapServicePort {
  private readonly data: SupabaseClient
  private readonly auth: SupabaseClient

  constructor(runtime: SupabaseRuntime) {
    this.data = createClient(runtime.url, runtime.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    this.auth = createClient(runtime.url, runtime.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  serviceClient() { return this.data }

  private async query<T = Row[]>(builder: PromiseLike<{ data: T | null; error: { message: string } | null }>, code = 'SUPABASE_ERROR') {
    const result = await builder
    if (result.error) throw new ServiceError(code, 503, result.error.message)
    return result.data as T
  }

  async findUserByEmail(email: string) {
    const row = await this.query<Row | null>(this.data.from('profiles').select('id,email,display_name,status').eq('email', email).maybeSingle(), 'PROFILE_LOOKUP_FAILED')
    return row ? { id: String(row.id), email: String(row.email), display_name: String(row.display_name), status: row.status as ApiUser['status'] } satisfies UserLookup : undefined
  }

  async findUserById(id: string) {
    const row = await this.query<Row | null>(this.data.from('profiles').select('id,email,display_name,status').eq('id', id).maybeSingle(), 'PROFILE_LOOKUP_FAILED')
    if (!row) return undefined
    const role = await this.roleForUser(id)
    return publicUser({ ...row, role })
  }

  async authenticate(email: string, password: string) {
    const { data, error } = await this.auth.auth.signInWithPassword({ email, password })
    if (error || !data.user) throw new ServiceError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect')
    const profile = await this.findUserById(data.user.id)
    if (!profile || profile.status !== 'active') throw new ServiceError('ACCOUNT_DISABLED', 401, 'Account is not active')
    return profile
  }

  async listUsers() {
    const rows = await this.query<Row[]>(this.data.from('profiles').select('id,email,display_name,status').order('display_name'), 'PROFILE_LOOKUP_FAILED')
    return Promise.all(rows.map(async (row) => publicUser({ ...row, role: await this.roleForUser(String(row.id)) })))
  }

  async roleForUser(userId: string): Promise<UserRole> {
    // Roles are sealed in auth.app_metadata in production. The service-role
    // adapter reads that claim from the Auth Admin API and falls back to the
    // operator role when a profile is not elevated.
    const { data } = await this.data.auth.admin.getUserById(userId)
    return data.user?.app_metadata?.role === 'admin' ? 'admin' : 'operator'
  }

  async listDevices(userId?: string): Promise<DeviceView[]> {
    let builder = this.data.from('user_devices').select('id,user_id,public_key,platform,device_name,app_version,status,last_seen_at,profiles(display_name)')
    if (userId) builder = builder.eq('user_id', userId)
    const rows = await this.query<Row[]>(builder.order('last_seen_at', { ascending: false }), 'DEVICE_LOOKUP_FAILED')
    return rows.map((row) => ({ id: String(row.id), userId: String(row.user_id), deviceName: String(row.device_name), platform: String(row.platform), appVersion: String(row.app_version), status: String(row.status), lastSeenAt: String(row.last_seen_at), user: String((row.profiles as Row | null)?.display_name ?? 'Unknown operator'), publicKeyPresent: Boolean(row.public_key) }))
  }

  async registerDevice(userId: string, input: { publicKey: string; platform: 'windows' | 'macos'; deviceName: string; appVersion: string }) {
    const row = await this.query<Row>(this.data.from('user_devices').upsert({ user_id: userId, public_key: input.publicKey, platform: input.platform, device_name: input.deviceName, app_version: input.appVersion, status: 'active', last_seen_at: new Date().toISOString() }, { onConflict: 'user_id,public_key' }).select('id').single(), 'DEVICE_WRITE_FAILED')
    await this.recordAudit(userId, 'DEVICE_REGISTERED', 'user_devices', String(row.id), { platform: input.platform })
    return String(row.id)
  }

  async revokeDevice(actorId: string, deviceId: string) {
    await this.query(this.data.from('user_devices').update({ status: 'revoked' }).eq('id', deviceId), 'DEVICE_WRITE_FAILED')
    await this.recordAudit(actorId, 'DEVICE_REVOKED', 'user_devices', deviceId, {})
  }

  async listAccounts(userId?: string): Promise<DashboardAccount[]> {
    let assignedIds: string[] | undefined
    if (userId) {
      const assignments = await this.query<Row[]>(this.data.from('account_assignments').select('account_id').eq('user_id', userId).eq('status', 'active'), 'ASSIGNMENT_LOOKUP_FAILED')
      assignedIds = assignments.map((row) => String(row.account_id))
      if (!assignedIds.length) return []
    }
    let accountQuery = this.data.from('accounts').select('id,display_name,region,status,metadata,updated_at').order('updated_at', { ascending: false })
    if (assignedIds) accountQuery = accountQuery.in('id', assignedIds)
    const rows = await this.query<Row[]>(accountQuery, 'ACCOUNT_LOOKUP_FAILED')
    const sessions = await this.query<Row[]>(this.data.from('account_sessions').select('id,account_id,started_at').in('status', activeStatuses), 'SESSION_LOOKUP_FAILED')
    const sessionMap = new Map(sessions.map((row) => [String(row.account_id), row]))
    return rows.map((row, index) => {
      const session = sessionMap.get(String(row.id))
      const metadata = (row.metadata as Row | null) ?? {}
      const status: DashboardAccount['status'] = row.status === 'maintenance' ? 'Maintenance' : session ? 'Leased' : 'Available'
      return { id: String(row.id), name: String(row.display_name), region: String(row.region), status, lastUsed: relativeTime(String(session?.started_at ?? row.updated_at)), level: Number(metadata.level ?? 120 + (index % 170)), accent: accentFor(String(row.id)) }
    })
  }

  async createAccount(actorId: string, input: { displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }) {
    const row = await this.query<Row>(this.data.from('accounts').insert({ provider: 'riot', external_id: input.externalId, display_name: input.displayName, region: input.region, status: input.status, metadata: {} }).select('id').single(), 'ACCOUNT_WRITE_FAILED')
    await this.recordAudit(actorId, 'ACCOUNT_CREATED', 'accounts', String(row.id), { displayName: input.displayName, region: input.region })
    return String(row.id)
  }

  async updateAccount(actorId: string, accountId: string, input: Partial<{ displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }>) {
    const patch: Row = {}
    if (input.displayName !== undefined) patch.display_name = input.displayName
    if (input.externalId !== undefined) patch.external_id = input.externalId
    if (input.region !== undefined) patch.region = input.region
    if (input.status !== undefined) patch.status = input.status
    await this.query(this.data.from('accounts').update(patch).eq('id', accountId), 'ACCOUNT_WRITE_FAILED')
    await this.recordAudit(actorId, 'ACCOUNT_UPDATED', 'accounts', accountId, { fields: Object.keys(patch) })
  }

  async deleteAccount(actorId: string, accountId: string) {
    const sessions = await this.query<Row[]>(this.data.from('account_sessions').select('id').eq('account_id', accountId).in('status', activeStatuses), 'SESSION_LOOKUP_FAILED')
    if (sessions.length) throw new ServiceError('ACCOUNT_BUSY', 409)
    await this.query(this.data.from('accounts').delete().eq('id', accountId), 'ACCOUNT_WRITE_FAILED')
    await this.recordAudit(actorId, 'ACCOUNT_DELETED', 'accounts', accountId, {})
  }

  async listAssignments(): Promise<AssignmentView[]> {
    const rows = await this.query<Row[]>(this.data.from('account_assignments').select('id,account_id,user_id,status,assigned_at,expires_at,accounts(display_name),profiles(display_name,email)').order('assigned_at', { ascending: false }), 'ASSIGNMENT_LOOKUP_FAILED')
    return rows.map((row) => ({ id: String(row.id), accountId: String(row.account_id), userId: String(row.user_id), account: String((row.accounts as Row | null)?.display_name ?? 'Unknown account'), user: String((row.profiles as Row | null)?.display_name ?? 'Unknown operator'), email: String((row.profiles as Row | null)?.email ?? ''), status: String(row.status), assignedAt: String(row.assigned_at), expiresAt: row.expires_at ? String(row.expires_at) : null }))
  }

  async addAssignment(actorId: string, accountId: string, userId: string, expiresAt: string | null) {
    const row = await this.query<Row>(this.data.from('account_assignments').upsert({ account_id: accountId, user_id: userId, status: 'active', assigned_at: new Date().toISOString(), expires_at: expiresAt }, { onConflict: 'account_id,user_id' }).select('id').single(), 'ASSIGNMENT_WRITE_FAILED')
    await this.recordAudit(actorId, 'ASSIGNMENT_UPDATED', 'account_assignments', String(row.id), { accountId, userId })
    return String(row.id)
  }

  async revokeAssignment(actorId: string, accountId: string, userId: string) {
    await this.query(this.data.from('account_assignments').update({ status: 'revoked' }).eq('account_id', accountId).eq('user_id', userId), 'ASSIGNMENT_WRITE_FAILED')
    await this.recordAudit(actorId, 'ASSIGNMENT_REVOKED', 'account_assignments', accountId, { userId })
  }

  async verifyDeviceChallenge(userId: string, deviceId: string, accountId: string, nonce: string, signature: string) {
    const [timestampText, nonceAccountId] = nonce.split(':', 2)
    const timestamp = Number(timestampText)
    if (!Number.isFinite(timestamp) || nonceAccountId !== accountId || Math.abs(Date.now() - timestamp) > 300_000) return false
    const device = await this.query<Row | null>(this.data.from('user_devices').select('public_key').eq('id', deviceId).eq('user_id', userId).eq('status', 'active').maybeSingle(), 'DEVICE_LOOKUP_FAILED')
    if (!device) return false
    try {
      const key = Buffer.from(String(device.public_key), 'base64')
      const sig = Buffer.from(signature, 'base64')
      if (key.length !== 32 || sig.length !== 64) return false
      const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key]), format: 'der', type: 'spki' })
      return verifySignature(null, Buffer.from(nonce), publicKey, sig)
    } catch { return false }
  }

  async getDashboard(userId: string): Promise<DashboardSnapshot> {
    const user = await this.findUserById(userId)
    if (!user) throw new ServiceError('USER_NOT_FOUND', 404)
    const scoped = user.role === 'admin' ? undefined : user.id
    const [metrics, sessions, activity, accounts] = await Promise.all([this.getMetrics(scoped), this.listSessions(scoped), this.listActivity(scoped), this.listAccounts(scoped)])
    return { user, metrics, sessions, activity, accounts }
  }

  async getMetrics(userId?: string): Promise<DashboardMetrics> {
    const [accounts, sessions, devices, users] = await Promise.all([this.listAccounts(userId), this.listSessions(userId), this.listDevices(userId), userId ? Promise.resolve([]) : this.listUsers()])
    const authorizedUsers = userId ? 1 : users.filter((row) => row.status === 'active').length
    return { availableAccounts: accounts.filter((row) => row.status === 'Available').length, totalAccounts: accounts.length, activeLeases: sessions.length, inGameLeases: sessions.filter((row) => row.runtimeState === 'IN_GAME').length, inClientLeases: sessions.filter((row) => row.runtimeState === 'IN_CLIENT').length, boundDevices: devices.filter((row) => row.status === 'active').length, healthyDevices: devices.filter((row) => row.status === 'active' && Date.now() - new Date(row.lastSeenAt).getTime() < 300_000).length, authorizedUsers, activeUsers: authorizedUsers }
  }

  async listSessions(userId?: string): Promise<DashboardSession[]> {
    let sessionQuery = this.data.from('account_sessions').select('id,account_id,user_id,device_id,status,runtime_state,started_at,last_heartbeat_at,reconnect_grace_until').in('status', activeStatuses)
    if (userId) sessionQuery = sessionQuery.eq('user_id', userId)
    const rows = await this.query<Row[]>(sessionQuery.order('started_at', { ascending: false }), 'SESSION_LOOKUP_FAILED')
    if (!rows.length) return []
    const accountIds = rows.map((row) => String(row.account_id)); const userIds = rows.map((row) => String(row.user_id)); const deviceIds = rows.map((row) => String(row.device_id))
    const [accounts, users, devices] = await Promise.all([this.query<Row[]>(this.data.from('accounts').select('id,display_name,region').in('id', accountIds), 'ACCOUNT_LOOKUP_FAILED'), this.query<Row[]>(this.data.from('profiles').select('id,display_name').in('id', userIds), 'PROFILE_LOOKUP_FAILED'), this.query<Row[]>(this.data.from('user_devices').select('id,device_name,platform').in('id', deviceIds), 'DEVICE_LOOKUP_FAILED')])
    const accountMap = new Map(accounts.map((row) => [String(row.id), row])); const userMap = new Map(users.map((row) => [String(row.id), row])); const deviceMap = new Map(devices.map((row) => [String(row.id), row]))
    return rows.map((row) => { const account = accountMap.get(String(row.account_id))!; const operator = userMap.get(String(row.user_id))!; const device = deviceMap.get(String(row.device_id))!; return { id: String(row.id), account: String(account.display_name), region: String(account.region), user: String(operator.display_name), initials: initials(String(operator.display_name)), device: `${String(device.device_name)} · ${String(device.platform) === 'macos' ? 'macOS' : 'Windows'}`, runtimeState: row.runtime_state as SessionState, status: row.status as DashboardSession['status'], started: relativeTime(String(row.started_at)), heartbeat: relativeTime(String(row.last_heartbeat_at)), avatarTone: toneFor(String(row.user_id)) } })
  }

  async listActivity(userId?: string): Promise<DashboardActivity[]> {
    let activityQuery = this.data.from('audit_logs').select('id,action,payload,created_at,actor_id')
    if (userId) activityQuery = activityQuery.eq('actor_id', userId)
    const rows = await this.query<Row[]>(activityQuery.order('created_at', { ascending: false }).limit(6), 'AUDIT_LOOKUP_FAILED')
    const actorIds = rows.map((row) => row.actor_id).filter(Boolean).map(String)
    const actors = actorIds.length ? await this.query<Row[]>(this.data.from('profiles').select('id,display_name').in('id', actorIds), 'PROFILE_LOOKUP_FAILED') : []
    const actorMap = new Map(actors.map((row) => [String(row.id), String(row.display_name)]))
    const actionMap: Record<string, { title: string; tone: DashboardActivity['tone'] }> = { SESSION_STARTED: { title: 'Lease acquired', tone: 'success' }, SESSION_ENDED: { title: 'Lease released', tone: 'neutral' }, DEVICE_REGISTERED: { title: 'Device registered', tone: 'info' }, ASSIGNMENT_UPDATED: { title: 'Assignment updated', tone: 'neutral' }, ASSIGNMENT_REVOKED: { title: 'Assignment revoked', tone: 'warning' }, SESSION_LAZILY_REAPED: { title: 'Stale session reaped', tone: 'warning' } }
    return rows.map((row, index) => { const action = String(row.action); const mapped = actionMap[action] ?? { title: action.replaceAll('_', ' ').toLowerCase(), tone: 'neutral' as const }; const payload = (row.payload as Row | null) ?? {}; const actor = actorMap.get(String(row.actor_id)) ?? 'System'; return { id: String(row.id), title: mapped.title, detail: payload.account ? `${String(payload.account)} · ${actor}` : `${actor} · ${action.replaceAll('_', ' ').toLowerCase()}`, time: index === 0 ? 'Just now' : relativeTime(String(row.created_at)), tone: mapped.tone } })
  }

  async acquireLease(userId: string, accountId: string, deviceId: string, options: { nonce?: string; signature?: string } = {}) {
    const result = await this.query<unknown>(this.data.rpc('acquire_account_lease_for_user', { p_user_id: userId, p_account_id: accountId, p_device_id: deviceId, p_nonce: options.nonce ?? null, p_signature: options.signature ?? null }), 'LEASE_ACQUIRE_FAILED')
    const payload = result as Row
    if (!payload.success) throw new ServiceError(String(payload.code ?? 'LEASE_ACQUIRE_FAILED'), payload.code === 'ACCOUNT_BUSY' ? 409 : 403)
    return { success: true, sessionId: String(payload.session_id), isReconnect: Boolean(payload.is_reconnect) } as const
  }

  async heartbeat(userId: string, sessionId: string, runtimeState: SessionState) {
    const result = await this.query<unknown>(this.data.rpc('heartbeat_account_session_for_user', { p_user_id: userId, p_session_id: sessionId, p_runtime_state: runtimeState }), 'HEARTBEAT_FAILED')
    const payload = result as Row
    if (!payload.success) throw new ServiceError(String(payload.code ?? 'SESSION_NOT_FOUND'), 404)
    return { success: true as const, sessionId }
  }

  async releaseLease(actor: ApiUser, sessionId: string, reason: string) {
    const parsed = releaseLeaseSchema.safeParse({ sessionId, reason })
    if (!parsed.success) throw new ServiceError('INVALID_RELEASE_REASON', 400)
    const result = await this.query<unknown>(this.data.rpc('release_account_lease_for_user', { p_actor_id: actor.id, p_session_id: sessionId, p_reason: reason, p_is_admin: actor.role === 'admin' }), 'LEASE_RELEASE_FAILED')
    const payload = result as Row
    if (!payload.success) throw new ServiceError(String(payload.code ?? 'LEASE_RELEASE_FAILED'), payload.code === 'FORBIDDEN' ? 403 : 404)
    return { success: true as const }
  }

  async listAudit(limit = 100): Promise<AuditView[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 500)
    const rows = await this.query<Row[]>(this.data.from('audit_logs').select('id,action,entity_type,entity_id,payload,created_at,actor_id').order('created_at', { ascending: false }).limit(safeLimit), 'AUDIT_LOOKUP_FAILED')
    const actorIds = rows.map((row) => row.actor_id).filter(Boolean).map(String)
    const actors = actorIds.length ? await this.query<Row[]>(this.data.from('profiles').select('id,display_name').in('id', actorIds), 'PROFILE_LOOKUP_FAILED') : []
    const actorMap = new Map(actors.map((row) => [String(row.id), String(row.display_name)]))
    return rows.map((row) => ({ id: String(row.id), action: String(row.action), entityType: String(row.entity_type), entityId: String(row.entity_id), payload: (row.payload as Record<string, unknown>) ?? {}, createdAt: String(row.created_at), actor: actorMap.get(String(row.actor_id)) ?? 'System' }))
  }

  async recordAudit(actorId: string, action: string, entityType: string, entityId: string, payload: Record<string, unknown>) {
    await this.query(this.data.from('audit_logs').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, payload }), 'AUDIT_WRITE_FAILED')
  }

  async reapStaleSessions() {
    const result = await this.query<unknown>(this.data.rpc('reap_stale_account_sessions'), 'REAPER_FAILED')
    return Number(result ?? 0)
  }
}

export class SupabaseCredentialVault implements CredentialVaultPort {
  constructor(private readonly client: SupabaseClient) {}

  async has(accountId: string) {
    const { data, error } = await this.client.from('accounts').select('vault_secret_id').eq('id', accountId).maybeSingle()
    if (error) throw new ServiceError('VAULT_STATUS_FAILED', 503, error.message)
    return Boolean(data?.vault_secret_id)
  }

  async set(accountId: string, username: string, password: string) {
    const { error } = await this.client.rpc('upsert_account_vault_secret', { p_account_id: accountId, p_username: username, p_password: password })
    if (error) throw new ServiceError('VAULT_WRITE_FAILED', 503, error.message)
  }
}
