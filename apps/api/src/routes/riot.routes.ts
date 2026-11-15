import { readAuth } from '../http/auth.js'
import { readRawBodyBytes } from '../http/body.js'
import { HttpError } from '../http/errors.js'
import { sendJson } from '../http/response.js'
import { authorizeRiotProxyHeaders, RiotProxyNonceCache } from '../http/riot-proxy-auth.js'
import type { RouteContext } from './types.js'

const MAX_RIOT_PROXY_BODY_BYTES = 16 * 1024
const serverNonceCache = new RiotProxyNonceCache()

async function authorizeRiotProxy(
  ctx: RouteContext,
  bodyBytes: Uint8Array,
): Promise<string> {
  const result = await authorizeRiotProxyHeaders({
    headers: ctx.request.headers,
    method: ctx.method,
    pathAndQuery: `${ctx.url.pathname}${ctx.url.search}`,
    bodyBytes,
    expectedSecret: ctx.runtime.riotProxyToken,
    allowStaticToken: true,
    nonceCache: serverNonceCache,
  })
  if (result.ok) {
    return result.method === 'hmac' ? 'proxy-hmac' : 'proxy-token'
  }

  const claims = await readAuth(ctx.request, ctx.runtime.jwtSecret)
  if (claims) {
    const user = await ctx.service.findUserById(claims.sub)
    if (user && user.status === 'active') return `user:${user.id}`
  }
  throw new HttpError(401, 'UNAUTHENTICATED', 'Riot proxy authorization token or active session required')
}

export async function handleRiotRoutes(ctx: RouteContext): Promise<void> {
  const { parts, method, url, request, response } = ctx
  if (parts.length !== 3 || parts[2] !== 'live-status' || (method !== 'GET' && method !== 'POST')) {
    throw new HttpError(404, 'NOT_FOUND')
  }

  const bodyBytes =
    method === 'POST'
      ? await readRawBodyBytes(request, MAX_RIOT_PROXY_BODY_BYTES)
      : new Uint8Array(0)

  const callerKey = await authorizeRiotProxy(ctx, bodyBytes)
  const limit = ctx.riotProxyLimiter.allow(callerKey)
  if (!limit.allowed) {
    throw new HttpError(429, 'RATE_LIMITED', `Too many live-status requests; retry in ${limit.retryAfterSeconds}s`, limit.retryAfterSeconds)
  }

  let region = ''
  let gameName = ''
  let tagLine = ''
  let puuid = ''
  let bypassCache = false

  if (method === 'POST') {
    let body: {
      region?: unknown
      gameName?: unknown
      tagLine?: unknown
      puuid?: unknown
      bypassCache?: unknown
    } = {}
    if (bodyBytes.byteLength > 0) {
      try {
        body = JSON.parse(Buffer.from(bodyBytes).toString('utf8')) as typeof body
      } catch {
        throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON')
      }
    }
    region = typeof body.region === 'string' ? body.region : ''
    gameName = typeof body.gameName === 'string' ? body.gameName : ''
    tagLine = typeof body.tagLine === 'string' ? body.tagLine : ''
    puuid = typeof body.puuid === 'string' ? body.puuid : ''
    bypassCache = body.bypassCache === true
  } else {
    region = url.searchParams.get('region') ?? ''
    gameName = url.searchParams.get('gameName') ?? ''
    tagLine = url.searchParams.get('tagLine') ?? ''
    puuid = url.searchParams.get('puuid') ?? ''
    bypassCache = url.searchParams.get('bypassCache') === 'true'
  }

  const status = await ctx.riotLive.lookup(
    { region, gameName, tagLine, puuid, bypassCache },
    ctx.runtime.riotApiKey,
  )
  sendJson(response, 200, status)
}
