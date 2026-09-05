import { clearAccessCookie, createAccessToken, readAuth, setAccessCookie } from '../http/auth.js'
import { readJson } from '../http/body.js'
import { HttpError } from '../http/errors.js'
import { sendJson } from '../http/response.js'
import { loginSchema } from '@laap/validation'
import { isTauriRequest, serviceErrorToHttp, type RouteContext } from './types.js'

export async function handleAuthRoutes(ctx: RouteContext): Promise<void> {
  const { request, response, service, runtime, loginLimiter, method, parts } = ctx
  const desktopRequest = isTauriRequest(request, runtime.nodeEnv)

  if (parts[2] === 'session' && method === 'GET') {
    const claims = await readAuth(request, runtime.jwtSecret)
    const user = claims ? await service.findUserById(claims.sub) : undefined
    return sendJson(response, 200, { user: user?.status === 'active' ? user : null })
  }

  if (parts[2] === 'demo' && method === 'POST') {
    if (!runtime.enableDemoAuth) throw new HttpError(404, 'NOT_FOUND')
    const user = await service.findUserByEmail('admin@laap.local')
    if (!user) throw new HttpError(500, 'DEMO_USER_MISSING')
    const publicUser = await service.findUserById(user.id)
    if (!publicUser) throw new HttpError(500, 'DEMO_USER_MISSING')
    const accessToken = await createAccessToken(publicUser, runtime.jwtSecret, '15m')
    if (!desktopRequest) setAccessCookie(response, accessToken, runtime.nodeEnv === 'production', 15 * 60)
    const responseBody: { user: typeof publicUser; accessToken?: string } = { user: publicUser }
    if (desktopRequest) responseBody.accessToken = accessToken
    return sendJson(response, 200, responseBody)
  }

  if (parts[2] === 'login' && method === 'POST') {
    const forwardedIp = String(request.headers['cf-connecting-ip'] ?? request.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
    const key = forwardedIp || request.socket.remoteAddress || 'unknown'
    const limit = loginLimiter.allow(key)
    if (!limit.allowed) throw new HttpError(429, 'RATE_LIMITED', `Too many login attempts. Retry in ${limit.retryAfterSeconds}s`)
    const input = loginSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, 'INVALID_LOGIN', 'Enter a valid email and password')
    try {
      const user = await service.authenticate(input.data.email, input.data.password)
      loginLimiter.reset(key)
      const remember = input.data.remember === true
      const expiresIn = remember ? '7d' : '15m'
      const accessToken = await createAccessToken(user, runtime.jwtSecret, expiresIn)
      if (!desktopRequest) setAccessCookie(response, accessToken, runtime.nodeEnv === 'production', remember ? 7 * 24 * 60 * 60 : 15 * 60)
      const responseBody: { user: typeof user; accessToken?: string } = { user }
      if (desktopRequest) responseBody.accessToken = accessToken
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
