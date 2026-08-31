import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { config as defaultConfig } from './config.js'
import type { AppDatabase } from './db/database.js'
import { readJson } from './http/body.js'
import { requireAdmin, requireAuth, createAccessToken, clearAccessCookie, readAuth, setAccessCookie } from './http/auth.js'
import { HttpError } from './http/errors.js'
import { FixedWindowRateLimiter } from './http/rate-limit.js'
import { applySecurityHeaders, sendError, sendJson } from './http/response.js'
import { ServiceError } from './services/service-error.js'
import type { CredentialVaultPort } from './services/credential-vault.js'
import { SupabaseCredentialVault, SupabaseLaapService } from './services/supabase-service.js'
import type { LaapServicePort } from './services/service-port.js'
import { accountCreateSchema, accountUpdateSchema, assignmentSchema, credentialSchema, deviceRegistrationSchema, heartbeatSchema, leaseAcquireSchema, loginSchema, userCreateSchema, uuidSchema } from '@laap/validation'

type RuntimeConfig = typeof defaultConfig & { reaperEnabled?: boolean }

export type AppHandle = {
  server: http.Server
  database?: AppDatabase
  service: LaapServicePort
  vault: CredentialVaultPort
  close: () => Promise<void>
}

function serviceErrorToHttp(error: unknown) {
  if (error instanceof ServiceError) return new HttpError(error.status, error.code, error.message)
  return error
}

async function currentUser(request: IncomingMessage, service: LaapServicePort, runtime: RuntimeConfig) {
  const claims = await requireAuth(request, runtime.jwtSecret)
  const user = await service.findUserById(claims.sub)
  if (!user || user.status !== 'active') throw new HttpError(401, 'UNAUTHENTICATED', 'Account is not active')
  return user
}

function originAllowed(request: IncomingMessage, runtime: RuntimeConfig) {
  const origin = request.headers.origin
  return !origin || origin === runtime.allowedOrigin
}

function routeUuid(value: string | undefined, code = 'INVALID_ID') {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) throw new HttpError(400, code, 'Resource identifier is invalid')
  return parsed.data
}

async function route(request: IncomingMessage, response: ServerResponse, service: LaapServicePort, vault: CredentialVaultPort, runtime: RuntimeConfig, loginLimiter: FixedWindowRateLimiter) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const method = request.method ?? 'GET'
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'api') throw new HttpError(404, 'NOT_FOUND')
  if (['POST', 'PATCH'].includes(method) && !['/api/auth/demo', '/api/auth/logout'].includes(url.pathname) && !String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON request body required')
  }

  if (parts[1] === 'health' && method === 'GET') return sendJson(response, 200, { status: 'ok', service: 'laap-api', environment: runtime.nodeEnv, timestamp: new Date().toISOString() })
  if (parts[1] === 'ready' && method === 'GET') return sendJson(response, 200, { status: 'ready', service: 'laap-api', timestamp: new Date().toISOString() })

  if (parts[1] === 'auth') {
    if (parts[2] === 'session' && method === 'GET') {
      const claims = await readAuth(request, runtime.jwtSecret)
      return sendJson(response, 200, { user: claims ? await service.findUserById(claims.sub) ?? null : null })
    }
    if (parts[2] === 'demo' && method === 'POST') {
      if (!runtime.enableDemoAuth) throw new HttpError(404, 'NOT_FOUND')
      const user = await service.findUserByEmail('admin@laap.local')
      if (!user) throw new HttpError(500, 'DEMO_USER_MISSING')
      const publicUser = await service.findUserById(user.id)
      if (!publicUser) throw new HttpError(500, 'DEMO_USER_MISSING')
      setAccessCookie(response, await createAccessToken(publicUser, runtime.jwtSecret), runtime.nodeEnv === 'production')
      return sendJson(response, 200, { user: publicUser })
    }
    if (parts[2] === 'login' && method === 'POST') {
      const key = request.socket.remoteAddress ?? 'unknown'
      const limit = loginLimiter.allow(key)
      if (!limit.allowed) throw new HttpError(429, 'RATE_LIMITED', `Too many login attempts. Retry in ${limit.retryAfterSeconds}s`)
      const input = loginSchema.safeParse(await readJson(request))
      if (!input.success) throw new HttpError(400, 'INVALID_LOGIN', 'Enter a valid email and password')
      try {
        const user = await service.authenticate(input.data.email, input.data.password)
        loginLimiter.reset(key)
        setAccessCookie(response, await createAccessToken(user, runtime.jwtSecret), runtime.nodeEnv === 'production')
        return sendJson(response, 200, { user })
      } catch (error) {
        throw serviceErrorToHttp(error)
      }
    }
    if (parts[2] === 'logout' && method === 'POST') {
      clearAccessCookie(response, runtime.nodeEnv === 'production')
      return sendJson(response, 200, { success: true })
    }
    throw new HttpError(404, 'NOT_FOUND')
  }

  const user = await currentUser(request, service, runtime)
  const scopedUserId = user.role === 'admin' ? undefined : user.id

  if (parts[1] === 'dashboard' && method === 'GET') return sendJson(response, 200, await service.getDashboard(user.id))
  if (parts[1] === 'metrics' && method === 'GET') return sendJson(response, 200, await service.getMetrics(scopedUserId))
  if (parts[1] === 'sessions' && method === 'GET') return sendJson(response, 200, { sessions: await service.listSessions(scopedUserId) })
  if (parts[1] === 'activity' && method === 'GET') return sendJson(response, 200, { activity: await service.listActivity(scopedUserId) })

  if (parts[1] === 'users' && method === 'GET') {
    await requireAdmin(request, runtime.jwtSecret)
    return sendJson(response, 200, { users: await service.listUsers() })
  }
  if (parts[1] === 'users' && parts.length === 2 && method === 'POST') {
    await requireAdmin(request, runtime.jwtSecret)
    const input = userCreateSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_USER', 'User fields are invalid')
    if (input.data.role === 'admin' && user.role !== 'admin') throw new HttpError(403, 'ADMIN_REQUIRED', 'Only an administrator can create administrators')
    try { return sendJson(response, 201, { user: await service.createUser(user.id, input.data) }) } catch (error) { throw serviceErrorToHttp(error) }
  }

  if (parts[1] === 'accounts' && parts.length === 4 && parts[3] === 'credential-status' && method === 'GET') {
    await requireAdmin(request, runtime.jwtSecret)
    if (runtime.nodeEnv === 'production' && runtime.storageDriver === 'local') throw new HttpError(501, 'USE_VAULT_EDGE_FUNCTION', 'Production credentials are managed through the Supabase Vault Edge Function')
    const accountId = routeUuid(parts[2], 'INVALID_ACCOUNT_ID')
    if (!(await service.listAccounts()).some((account) => account.id === accountId)) throw new HttpError(404, 'ACCOUNT_NOT_FOUND')
    return sendJson(response, 200, { accountId, hasCredential: await vault.has(accountId) })
  }
  if (parts[1] === 'accounts' && parts.length === 4 && parts[3] === 'credentials' && method === 'POST') {
    await requireAdmin(request, runtime.jwtSecret)
    if (runtime.nodeEnv === 'production' && runtime.storageDriver === 'local') throw new HttpError(501, 'USE_VAULT_EDGE_FUNCTION', 'Production credentials are managed through the Supabase Vault Edge Function')
    const accountId = routeUuid(parts[2], 'INVALID_ACCOUNT_ID')
    if (!(await service.listAccounts()).some((account) => account.id === accountId)) throw new HttpError(404, 'ACCOUNT_NOT_FOUND')
    const input = credentialSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_CREDENTIAL', 'Credential fields are invalid')
    await vault.set(accountId, input.data.username, input.data.password)
    await service.recordAudit(user.id, 'CREDENTIAL_ROTATED', 'accounts', accountId, { storedIn: 'local-encrypted-vault' })
    response.statusCode = 204
    response.end()
    return
  }
  if (parts[1] === 'accounts' && parts.length === 2 && method === 'GET') return sendJson(response, 200, { accounts: await service.listAccounts(user.role === 'admin' ? undefined : user.id) })
  if (parts[1] === 'accounts' && parts.length === 2 && method === 'POST') {
    await requireAdmin(request, runtime.jwtSecret)
    const input = accountCreateSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_ACCOUNT', 'Account fields are invalid')
    const accountId = await service.createAccount(user.id, input.data)
    return sendJson(response, 201, { accountId })
  }
  if (parts[1] === 'accounts' && parts.length === 3 && method === 'PATCH') {
    await requireAdmin(request, runtime.jwtSecret)
    const input = accountUpdateSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_ACCOUNT', 'Account fields are invalid')
    await service.updateAccount(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'), input.data)
    return sendJson(response, 200, { success: true })
  }
  if (parts[1] === 'accounts' && parts.length === 3 && method === 'DELETE') {
    await requireAdmin(request, runtime.jwtSecret)
    await service.deleteAccount(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'))
    return sendJson(response, 200, { success: true })
  }

  if (parts[1] === 'assignments' && parts.length === 2 && method === 'GET') {
    await requireAdmin(request, runtime.jwtSecret)
    return sendJson(response, 200, { assignments: await service.listAssignments() })
  }
  if (parts[1] === 'assignments' && parts.length === 2 && method === 'POST') {
    await requireAdmin(request, runtime.jwtSecret)
    const input = assignmentSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_ASSIGNMENT', 'Assignment fields are invalid')
    const assignmentId = await service.addAssignment(user.id, input.data.accountId, input.data.userId, input.data.expiresAt ?? null)
    return sendJson(response, 201, { assignmentId })
  }
  if (parts[1] === 'assignments' && parts.length === 4 && method === 'DELETE') {
    await requireAdmin(request, runtime.jwtSecret)
    await service.revokeAssignment(user.id, routeUuid(parts[2], 'INVALID_ACCOUNT_ID'), routeUuid(parts[3], 'INVALID_USER_ID'))
    return sendJson(response, 200, { success: true })
  }

  if (parts[1] === 'devices' && parts.length === 2 && method === 'GET') return sendJson(response, 200, { devices: await service.listDevices(user.role === 'admin' ? undefined : user.id) })
  if (parts[1] === 'devices' && parts.length === 2 && method === 'POST') {
    const input = deviceRegistrationSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_DEVICE', 'Device fields are invalid')
    const deviceId = await service.registerDevice(user.id, input.data)
    return sendJson(response, 201, { deviceId })
  }
  if (parts[1] === 'devices' && parts.length === 3 && method === 'DELETE') {
    await requireAdmin(request, runtime.jwtSecret)
    await service.revokeDevice(user.id, routeUuid(parts[2], 'INVALID_DEVICE_ID'))
    return sendJson(response, 200, { success: true })
  }

  if (parts[1] === 'audit' && method === 'GET') {
    await requireAdmin(request, runtime.jwtSecret)
    return sendJson(response, 200, { audit: await service.listAudit(Number(url.searchParams.get('limit') ?? 100)) })
  }

  if (parts[1] === 'leases' && parts[2] === 'acquire' && method === 'POST') {
    const input = leaseAcquireSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_LEASE_REQUEST', 'Account and device are required')
    const signed = Boolean(input.data.nonce || input.data.signature)
    if (signed !== Boolean(input.data.nonce && input.data.signature)) throw new HttpError(400, 'INVALID_DEVICE_SIGNATURE', 'Nonce and signature must be supplied together')
    if (runtime.nodeEnv === 'production' && !signed) throw new HttpError(401, 'DEVICE_SIGNATURE_REQUIRED', 'A signed device challenge is required')
    if (signed && !(await service.verifyDeviceChallenge(user.id, input.data.deviceId, input.data.accountId, input.data.nonce!, input.data.signature!))) throw new HttpError(401, 'INVALID_DEVICE_SIGNATURE', 'Device challenge could not be verified')
    try {
      return sendJson(response, 200, await service.acquireLease(user.id, input.data.accountId, input.data.deviceId, input.data))
    } catch (error) {
      throw serviceErrorToHttp(error)
    }
  }
  if (parts[1] === 'leases' && parts.length === 4 && parts[3] === 'heartbeat' && method === 'POST' && parts[2]) {
    const sessionId = routeUuid(parts[2], 'INVALID_SESSION_ID')
    const input = await readJson<{ runtimeState?: unknown }>(request)
    const parsed = heartbeatSchema.safeParse({ sessionId, runtimeState: input.runtimeState, observedAt: new Date().toISOString() })
    if (!parsed.success) throw new HttpError(400, 'INVALID_HEARTBEAT', 'Runtime state is invalid')
    try {
      return sendJson(response, 200, await service.heartbeat(user.id, sessionId, parsed.data.runtimeState))
    } catch (error) {
      throw serviceErrorToHttp(error)
    }
  }
  if (parts[1] === 'leases' && parts.length === 4 && parts[3] === 'release' && method === 'POST') {
    const input = await readJson<{ reason?: string }>(request)
    try {
      return sendJson(response, 200, await service.releaseLease(user, routeUuid(parts[2], 'INVALID_SESSION_ID'), input.reason ?? 'manual'))
    } catch (error) {
      throw serviceErrorToHttp(error)
    }
  }

  throw new HttpError(404, 'NOT_FOUND')
}

export async function createApp(overrides: Partial<RuntimeConfig> & { dataDir?: string } = {}): Promise<AppHandle> {
  const [{ AppDatabase }, { seedDatabase }, { LaapService }, { LocalCredentialVault }] = await Promise.all([
    import('./db/database.js'),
    import('./db/seed.js'),
    import('./services/laap-service.js'),
    import('./services/credential-vault.js'),
  ])
  const runtime = { ...defaultConfig, ...overrides }
  if (runtime.storageDriver !== 'local') throw new Error('The Supabase/Postgres adapter is deployed through the Supabase migration and Edge Functions; this local API only supports storageDriver=local')
  const database = await AppDatabase.open(overrides.dataDir ?? runtime.dataDir)
  await seedDatabase(database, runtime.adminPassword)
  const service = new LaapService(database)
  const vault = await LocalCredentialVault.open(`${database.filePath}.vault.json`, runtime.vaultKey)
  const loginLimiter = new FixedWindowRateLimiter(8, 5 * 60_000)
  const server = http.createServer(async (request, response) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    response.setHeader('X-Request-ID', requestId)
    response.on('finish', () => {
      if (runtime.logRequests) console.info(JSON.stringify({ event: 'http_request', requestId, method: request.method, path: (request.url ?? '/').split('?')[0], status: response.statusCode, durationMs: Date.now() - startedAt }))
    })
    applySecurityHeaders(response, runtime.allowedOrigin, runtime.nodeEnv === 'production')
    if (!originAllowed(request, runtime)) return sendJson(response, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed' } })
    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      response.end()
      return
    }
    try {
      await route(request, response, service, vault, runtime, loginLimiter)
      if (request.method && ['POST', 'PATCH', 'DELETE'].includes(request.method)) await database.save()
    } catch (error) {
      sendError(response, serviceErrorToHttp(error), requestId)
    }
  })
  const reaper = runtime.reaperEnabled === false ? undefined : setInterval(() => { service.reapStaleSessions(); loginLimiter.sweep() }, 60_000)
  reaper?.unref()
  return { server, database, service, vault, close: async () => { if (reaper) clearInterval(reaper); await database.save(); database.close(); if (!server.listening) return; await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) } }
}

export async function createSupabaseApp(overrides: Partial<RuntimeConfig> = {}): Promise<AppHandle> {
  const runtime = { ...defaultConfig, ...overrides, storageDriver: 'supabase' }
  if (!runtime.supabaseUrl || !runtime.supabaseAnonKey || !runtime.supabaseServiceRoleKey) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required for the Supabase storage driver')
  const service = new SupabaseLaapService({ url: runtime.supabaseUrl, anonKey: runtime.supabaseAnonKey, serviceRoleKey: runtime.supabaseServiceRoleKey })
  const vault = new SupabaseCredentialVault(service.serviceClient())
  const loginLimiter = new FixedWindowRateLimiter(8, 5 * 60_000)
  const server = http.createServer(async (request, response) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    response.setHeader('X-Request-ID', requestId)
    response.on('finish', () => {
      if (runtime.logRequests) console.info(JSON.stringify({ event: 'http_request', requestId, method: request.method, path: (request.url ?? '/').split('?')[0], status: response.statusCode, durationMs: Date.now() - startedAt }))
    })
    applySecurityHeaders(response, runtime.allowedOrigin, runtime.nodeEnv === 'production')
    if (!originAllowed(request, runtime)) return sendJson(response, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed' } })
    if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return }
    try {
      await route(request, response, service, vault, runtime, loginLimiter)
    } catch (error) {
      sendError(response, serviceErrorToHttp(error), requestId)
    }
  })
  const reaper = runtime.reaperEnabled === false ? undefined : setInterval(() => { void service.reapStaleSessions() }, 60_000)
  reaper?.unref()
  return { server, service, vault, close: async () => { if (reaper) clearInterval(reaper); if (!server.listening) return; await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = defaultConfig.storageDriver === 'supabase' ? await createSupabaseApp() : await createApp()
  app.server.on('error', (error) => { console.error(JSON.stringify({ event: 'server_error', error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1 })
  app.server.listen(defaultConfig.port, '127.0.0.1', () => console.log(`LAAP API listening on http://127.0.0.1:${defaultConfig.port}`))
  const shutdown = async (signal: string) => { console.info(JSON.stringify({ event: 'shutdown_started', signal })); try { await app.close(); process.exitCode = 0 } catch (error) { console.error(JSON.stringify({ event: 'shutdown_failed', error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1 } }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}
