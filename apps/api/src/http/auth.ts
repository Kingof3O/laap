import type { ServerResponse } from 'node:http'
import { SignJWT, jwtVerify } from 'jose'
import type { ApiUser } from '@laap/types'
import { HttpError } from './errors.js'

const encoder = new TextEncoder()
const developmentCookieName = 'laap_access'
const productionCookieName = '__Host-laap_access'

export type AuthClaims = { sub: string; email: string; displayName: string; role: ApiUser['role'] }

function cookieOptions(name: string, maxAge: number, secure: boolean) {
  // The production dashboard and API use different Cloudflare domains. A
  // cross-site fetch therefore requires SameSite=None; the API's strict
  // Origin allowlist remains the CSRF boundary.
  return `${name}=VALUE; HttpOnly; SameSite=${secure ? 'None' : 'Lax'}; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

export async function createAccessToken(user: ApiUser, secret: string) {
  return new SignJWT({ email: user.email, displayName: user.displayName, role: user.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(encoder.encode(secret))
}

export function setAccessCookie(response: ServerResponse, token: string, secure = process.env.NODE_ENV === 'production') {
  const name = secure ? productionCookieName : developmentCookieName
  response.setHeader('Set-Cookie', cookieOptions(name, 8 * 60 * 60, secure).replace('VALUE', token))
}

export function clearAccessCookie(response: ServerResponse, secure = process.env.NODE_ENV === 'production') {
  const name = secure ? productionCookieName : developmentCookieName
  response.setHeader('Set-Cookie', cookieOptions(name, 0, secure).replace('VALUE', ''))
}

function readCookie(header: string | undefined) {
  if (!header) return undefined
  const pair = header.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${developmentCookieName}=`) || value.startsWith(`${productionCookieName}=`))
  if (!pair) return undefined
  const separator = pair.indexOf('=')
  return separator === -1 ? undefined : pair.slice(separator + 1)
}

export async function readAuth(request: { headers: { authorization?: string; cookie?: string } }, secret: string): Promise<AuthClaims | null> {
  const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined
  const token = bearer ?? readCookie(request.headers.cookie)
  if (!token) return null
  try {
    const verified = await jwtVerify(token, encoder.encode(secret), { algorithms: ['HS256'] })
    const payload = verified.payload
    if (!payload.sub || typeof payload.email !== 'string' || typeof payload.displayName !== 'string' || (payload.role !== 'admin' && payload.role !== 'operator')) return null
    return { sub: payload.sub, email: payload.email, displayName: payload.displayName, role: payload.role }
  } catch {
    return null
  }
}

export async function requireAuth(request: { headers: { authorization?: string; cookie?: string } }, secret: string) {
  const claims = await readAuth(request, secret)
  if (!claims) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in is required')
  return claims
}

export async function requireAdmin(request: { headers: { authorization?: string; cookie?: string } }, secret: string) {
  const claims = await requireAuth(request, secret)
  if (claims.role !== 'admin') throw new HttpError(403, 'ADMIN_REQUIRED', 'Administrator access is required')
  return claims
}
