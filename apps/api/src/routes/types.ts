import type { IncomingMessage, ServerResponse } from 'node:http'
import { config as defaultConfig } from '../config.js'
import type { LaapServicePort } from '../services/service-port.js'
import type { FixedWindowRateLimiter } from '../http/rate-limit.js'
import { requireAuth } from '../http/auth.js'
import { HttpError } from '../http/errors.js'
import { ServiceError } from '../services/service-error.js'
import { uuidSchema } from '@laap/validation'
import type { ApiUser } from '@laap/types'

export type RuntimeConfig = typeof defaultConfig & { reaperEnabled?: boolean }

export interface RouteContext {
  request: IncomingMessage
  response: ServerResponse
  service: LaapServicePort
  runtime: RuntimeConfig
  loginLimiter: FixedWindowRateLimiter
  url: URL
  method: string
  parts: string[]
}

export function serviceErrorToHttp(error: unknown): unknown {
  if (error instanceof ServiceError) {
    return new HttpError(error.status, error.code, error.status >= 500 ? 'The service is temporarily unavailable' : error.message)
  }
  return error
}

export async function currentUser(request: IncomingMessage, service: LaapServicePort, runtime: RuntimeConfig): Promise<ApiUser> {
  const claims = await requireAuth(request, runtime.jwtSecret)
  const user = await service.findUserById(claims.sub)
  if (!user || user.status !== 'active') throw new HttpError(401, 'UNAUTHENTICATED', 'Account is not active')
  return user
}

export function requireCurrentAdmin(user: ApiUser) {
  if (user.role !== 'admin') throw new HttpError(403, 'ADMIN_REQUIRED', 'Administrator access is required')
  return user
}

export const trustedDesktopOrigins = new Set([
  'tauri://localhost',
  'https://tauri.localhost',
  'http://tauri.localhost',
])

export function isTrustedDesktopOrigin(origin: string, nodeEnv = 'development') {
  const normalized = origin.toLowerCase()
  return trustedDesktopOrigins.has(normalized) || (nodeEnv !== 'production' && normalized === 'http://localhost:1420')
}

export function isTauriRequest(request: IncomingMessage, nodeEnv = 'development') {
  const origin = String(request.headers.origin ?? '').toLowerCase()
  return isTrustedDesktopOrigin(origin, nodeEnv)
}

export function routeUuid(value: string | undefined, code = 'INVALID_ID'): string {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) throw new HttpError(400, code, 'Resource identifier is invalid')
  return parsed.data
}

export function queryInteger(value: string | null, fallback: number, minimum: number, maximum: number): number {
  if (value === null || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum) return fallback
  return Math.min(parsed, maximum)
}
