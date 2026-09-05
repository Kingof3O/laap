import http from 'node:http'
import type { IncomingMessage } from 'node:http'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { config as defaultConfig } from './config.js'
import type { AppDatabase } from './db/database.js'
import { FixedWindowRateLimiter } from './http/rate-limit.js'
import { applySecurityHeaders, sendError, sendJson } from './http/response.js'
import { SupabaseLaapService } from './services/supabase-service.js'
import type { LaapServicePort } from './services/service-port.js'
import { routeRequest } from './router.js'
import { isTrustedDesktopOrigin, serviceErrorToHttp, type RuntimeConfig } from './routes/types.js'

export type AppHandle = {
  server: http.Server
  database?: AppDatabase
  service: LaapServicePort
  close: () => Promise<void>
}

function originAllowed(request: IncomingMessage, runtime: RuntimeConfig): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  const normalized = origin.toLowerCase()
  if (runtime.nodeEnv === 'production' && /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) return false
  return runtime.allowedOrigin.split(',').map((value) => value.trim()).includes(origin) || isTrustedDesktopOrigin(normalized, runtime.nodeEnv)
}

function responseOrigin(request: IncomingMessage, runtime: RuntimeConfig): string {
  return request.headers.origin && originAllowed(request, runtime)
    ? request.headers.origin
    : runtime.allowedOrigin.split(',')[0].trim()
}

function configureServer(server: http.Server) {
  // Bound request lifetimes keep an abandoned upload from holding a worker
  // or local API connection open indefinitely.
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.keepAliveTimeout = 5_000
  return server
}

export async function createApp(overrides: Partial<RuntimeConfig> & { dataDir?: string } = {}): Promise<AppHandle> {
  const [{ AppDatabase }, { seedDatabase }, { LaapService }] = await Promise.all([
    import('./db/database.js'),
    import('./db/seed.js'),
    import('./services/laap-service.js'),
  ])

  const runtime: RuntimeConfig = { ...defaultConfig, ...overrides }
  if (runtime.storageDriver !== 'local') {
    throw new Error('The Supabase/Postgres adapter is deployed through Supabase migrations; local API requires storageDriver=local')
  }
  if (runtime.nodeEnv === 'production' && (runtime.jwtSecret.length < 32 || runtime.vaultKey.length < 32)) {
    throw new Error('LAAP_JWT_SECRET and LAAP_VAULT_KEY must each contain at least 32 characters in production')
  }

  const database = await AppDatabase.open(overrides.dataDir ?? runtime.dataDir)
  await seedDatabase(database, runtime.adminPassword)
  const service = new LaapService(database, runtime.vaultKey)
  const loginLimiter = new FixedWindowRateLimiter(8, 5 * 60_000)

  const server = configureServer(http.createServer(async (request, response) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    response.setHeader('X-Request-ID', requestId)

    response.on('finish', () => {
      if (runtime.logRequests) {
        console.info(JSON.stringify({
          event: 'http_request',
          requestId,
          method: request.method,
          path: (request.url ?? '/').split('?')[0],
          status: response.statusCode,
          durationMs: Date.now() - startedAt,
        }))
      }
    })

    applySecurityHeaders(response, responseOrigin(request, runtime), runtime.nodeEnv === 'production')

    if (!originAllowed(request, runtime)) {
      return sendJson(response, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed' } })
    }

    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      response.end()
      return
    }

    try {
      await routeRequest(request, response, service, runtime, loginLimiter)
      if (request.method && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
        await database.save()
      }
    } catch (error) {
      sendError(response, serviceErrorToHttp(error), requestId)
    }
  }))

  const reaper = runtime.reaperEnabled === false ? undefined : setInterval(() => {
    void Promise.resolve(service.reapStaleSessions()).catch((error) => {
      if (runtime.logRequests) console.error(JSON.stringify({ event: 'session_reaper_failed', error: error instanceof Error ? error.message : String(error) }))
    })
    loginLimiter.sweep()
  }, 60_000)
  reaper?.unref()

  return {
    server,
    database,
    service,
    close: async () => {
      if (reaper) clearInterval(reaper)
      await database.save()
      database.close()
      if (!server.listening) return
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    },
  }
}

export async function createSupabaseApp(overrides: Partial<RuntimeConfig> = {}): Promise<AppHandle> {
  const runtime: RuntimeConfig = { ...defaultConfig, ...overrides, storageDriver: 'supabase' }
  if (!runtime.supabaseUrl || !runtime.supabaseAnonKey || !runtime.supabaseServiceRoleKey || runtime.jwtSecret.length < 32 || runtime.vaultKey.length < 32) {
    throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, a 32+ character LAAP_JWT_SECRET, and a 32+ character LAAP_VAULT_KEY are required for the Supabase storage driver')
  }

  const service = new SupabaseLaapService({
    url: runtime.supabaseUrl,
    anonKey: runtime.supabaseAnonKey,
    serviceRoleKey: runtime.supabaseServiceRoleKey,
    vaultKey: runtime.vaultKey,
  })
  const loginLimiter = new FixedWindowRateLimiter(8, 5 * 60_000)

  const server = configureServer(http.createServer(async (request, response) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    response.setHeader('X-Request-ID', requestId)

    response.on('finish', () => {
      if (runtime.logRequests) {
        console.info(JSON.stringify({
          event: 'http_request',
          requestId,
          method: request.method,
          path: (request.url ?? '/').split('?')[0],
          status: response.statusCode,
          durationMs: Date.now() - startedAt,
        }))
      }
    })

    applySecurityHeaders(response, responseOrigin(request, runtime), runtime.nodeEnv === 'production')

    if (!originAllowed(request, runtime)) {
      return sendJson(response, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed' } })
    }

    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      response.end()
      return
    }

    try {
      await routeRequest(request, response, service, runtime, loginLimiter)
    } catch (error) {
      sendError(response, serviceErrorToHttp(error), requestId)
    }
  }))

  const reaper = runtime.reaperEnabled === false ? undefined : setInterval(() => {
    void service.reapStaleSessions().catch((error) => {
      if (runtime.logRequests) console.error(JSON.stringify({ event: 'session_reaper_failed', error: error instanceof Error ? error.message : String(error) }))
    })
  }, 60_000)
  reaper?.unref()

  return {
    server,
    service,
    close: async () => {
      if (reaper) clearInterval(reaper)
      if (!server.listening) return
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = defaultConfig.storageDriver === 'supabase' ? await createSupabaseApp() : await createApp()
  app.server.on('error', (error) => {
    console.error(JSON.stringify({ event: 'server_error', error: error instanceof Error ? error.message : String(error) }))
    process.exitCode = 1
  })
  app.server.listen(defaultConfig.port, '127.0.0.1', () => {
    console.log(`LAAP API listening on http://127.0.0.1:${defaultConfig.port}`)
  })
  const shutdown = async (signal: string) => {
    console.info(JSON.stringify({ event: 'shutdown_started', signal }))
    try {
      await app.close()
      process.exitCode = 0
    } catch (error) {
      console.error(JSON.stringify({ event: 'shutdown_failed', error: error instanceof Error ? error.message : String(error) }))
      process.exitCode = 1
    }
  }
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}
