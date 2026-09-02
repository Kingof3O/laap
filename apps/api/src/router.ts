import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FixedWindowRateLimiter } from './http/rate-limit.js'
import { HttpError } from './http/errors.js'
import { sendJson } from './http/response.js'
import type { LaapServicePort } from './services/service-port.js'
import type { RouteContext, RuntimeConfig } from './routes/types.js'
import { handleAuthRoutes } from './routes/auth.routes.js'
import { handleAccountRoutes } from './routes/accounts.routes.js'
import { handleLeaseRoutes } from './routes/leases.routes.js'
import { handleDeviceRoutes } from './routes/devices.routes.js'
import { handleAdminAndDashboardRoutes } from './routes/admin.routes.js'

export async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: LaapServicePort,
  runtime: RuntimeConfig,
  loginLimiter: FixedWindowRateLimiter
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const method = request.method ?? 'GET'
  const parts = url.pathname.split('/').filter(Boolean)

  if (parts[0] !== 'api') throw new HttpError(404, 'NOT_FOUND')

  if (
    ['POST', 'PATCH', 'PUT'].includes(method) &&
    !['/api/auth/demo', '/api/auth/logout'].includes(url.pathname) &&
    !String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')
  ) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON request body required')
  }

  // Health and readiness endpoints
  if (parts[1] === 'health' && method === 'GET') {
    return sendJson(response, 200, {
      status: 'ok',
      service: 'laap-api',
      environment: runtime.nodeEnv,
      timestamp: new Date().toISOString(),
    })
  }

  if (parts[1] === 'ready' && method === 'GET') {
    return sendJson(response, 200, {
      status: 'ready',
      service: 'laap-api',
      timestamp: new Date().toISOString(),
    })
  }

  const ctx: RouteContext = {
    request,
    response,
    service,
    runtime,
    loginLimiter,
    url,
    method,
    parts,
  }

  // Domain dispatching
  switch (parts[1]) {
    case 'auth':
      return handleAuthRoutes(ctx)
    case 'accounts':
      return handleAccountRoutes(ctx)
    case 'leases':
      return handleLeaseRoutes(ctx)
    case 'devices':
      return handleDeviceRoutes(ctx)
    case 'dashboard':
    case 'metrics':
    case 'sessions':
    case 'activity':
    case 'users':
    case 'assignments':
    case 'audit':
      return handleAdminAndDashboardRoutes(ctx)
    default:
      throw new HttpError(404, 'NOT_FOUND')
  }
}
