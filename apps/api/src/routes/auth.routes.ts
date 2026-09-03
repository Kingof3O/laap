import { clearAccessCookie, createAccessToken, readAuth, setAccessCookie } from '../http/auth.js'
import { readJson } from '../http/body.js'
import { HttpError } from '../http/errors.js'
import { sendJson } from '../http/response.js'
import { loginSchema } from '@laap/validation'
import { serviceErrorToHttp, type RouteContext } from './types.js'

export async function handleAuthRoutes(ctx: RouteContext): Promise<void> {
  const { request, response, service, runtime, loginLimiter, url, method, parts } = ctx

  if (parts[2] === 'session' && method === 'GET') {
    const claims = await readAuth(request, runtime.jwtSecret)
    return sendJson(response, 200, { user: claims ? (await service.findUserById(claims.sub)) ?? null : null })
  }

  if (parts[2] === 'demo' && method === 'POST') {
    if (!runtime.enableDemoAuth) throw new HttpError(404, 'NOT_FOUND')
    const user = await service.findUserByEmail('admin@laap.local')
    if (!user) throw new HttpError(500, 'DEMO_USER_MISSING')
    const publicUser = await service.findUserById(user.id)
    if (!publicUser) throw new HttpError(500, 'DEMO_USER_MISSING')
    const accessToken = await createAccessToken(publicUser, runtime.jwtSecret)
    setAccessCookie(response, accessToken, runtime.nodeEnv === 'production')
    const responseBody = { user: publicUser, accessToken }
    return sendJson(response, 200, responseBody)
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
      const accessToken = await createAccessToken(user, runtime.jwtSecret)
      setAccessCookie(response, accessToken, runtime.nodeEnv === 'production')
      const responseBody = { user, accessToken }
      return sendJson(response, 200, responseBody)
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
