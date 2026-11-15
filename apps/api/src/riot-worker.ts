import { HttpError, isHttpError } from './http/errors.js'
import { FixedWindowRateLimiter } from './http/rate-limit.js'
import { authorizeRiotProxyHeaders, RiotProxyNonceCache } from './http/riot-proxy-auth.js'
import { RiotLiveTracker } from './services/riot-live.js'

export interface RiotWorkerEnv {
  NODE_ENV?: string
  ALLOWED_ORIGIN?: string
  RIOT_API_KEY?: string
  LAAP_RIOT_PROXY_TOKEN?: string
  LAAP_REQUIRE_HMAC?: string
}

const DEFAULT_ALLOWED_ORIGIN = 'https://laap-control-center.pages.dev'
const MAX_BODY_BYTES = 16 * 1024

function isTrustedOrigin(origin: string | null, env: RiotWorkerEnv): boolean {
  if (!origin) return true
  const normalized = origin.toLowerCase()
  const isProd = env.NODE_ENV === 'production'
  if (
    normalized === 'tauri://localhost' ||
    normalized === 'http://tauri.localhost' ||
    normalized === 'https://tauri.localhost'
  ) {
    return true
  }
  if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
    return true
  }
  const allowlist = (env.ALLOWED_ORIGIN ?? DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return allowlist.includes(origin)
}

function buildHeaders(origin: string | null, allowedOriginHeader: string, retryAfter?: number): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
    'Access-Control-Allow-Origin': origin ?? allowedOriginHeader,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Laap-Riot-Token, X-Laap-Timestamp, X-Laap-Nonce, X-Laap-Signature',
  })
  if (typeof retryAfter === 'number' && retryAfter > 0) {
    headers.set('Retry-After', String(retryAfter))
  }
  return headers
}

async function readBoundedBodyBytes(request: Request): Promise<Uint8Array> {
  if (request.method === 'GET') {
    return new Uint8Array(0)
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 16 KiB limit')
  }
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > MAX_BODY_BYTES) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 16 KiB limit')
  }
  return bytes
}

function extractLookupParams(request: Request, url: URL, bodyBytes: Uint8Array) {
  if (request.method === 'GET') {
    return {
      region: url.searchParams.get('region') ?? '',
      gameName: url.searchParams.get('gameName') ?? '',
      tagLine: url.searchParams.get('tagLine') ?? '',
      puuid: url.searchParams.get('puuid') ?? '',
      bypassCache: url.searchParams.get('bypassCache') === 'true',
    }
  }

  const rawText = new TextDecoder().decode(bodyBytes)
  let parsed: Record<string, unknown>
  try {
    parsed = (rawText.trim() ? JSON.parse(rawText) : {}) as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be a JSON object')
  }
  return {
    region: typeof parsed.region === 'string' ? parsed.region : '',
    gameName: typeof parsed.gameName === 'string' ? parsed.gameName : '',
    tagLine: typeof parsed.tagLine === 'string' ? parsed.tagLine : '',
    puuid: typeof parsed.puuid === 'string' ? parsed.puuid : '',
    bypassCache: parsed.bypassCache === true,
  }
}

export function createRiotWorker(
  tracker = new RiotLiveTracker(),
  limiter = new FixedWindowRateLimiter(30, 60_000),
  clock: () => number = () => Date.now(),
  nonceCache = new RiotProxyNonceCache(),
) {
  return {
    async fetch(request: Request, env: RiotWorkerEnv = {}): Promise<Response> {
      const origin = request.headers.get('origin')
      const fallbackOrigin =
        (env.ALLOWED_ORIGIN ?? DEFAULT_ALLOWED_ORIGIN).split(',')[0]?.trim() ||
        DEFAULT_ALLOWED_ORIGIN
      const allowed = isTrustedOrigin(origin, env)
      const headers = buildHeaders(allowed ? origin : null, fallbackOrigin)

      if (!allowed) {
        return new Response(
          JSON.stringify({
            error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed' },
          }),
          { status: 403, headers },
        )
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers })
      }

      const url = new URL(request.url)

      if (request.method === 'GET' && url.pathname === '/api/health') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'laap-api',
            mode: 'riot-live-proxy',
            environment: env.NODE_ENV ?? 'production',
            timestamp: new Date(clock()).toISOString(),
          }),
          { status: 200, headers },
        )
      }

      if (request.method === 'GET' && url.pathname === '/api/ready') {
        return new Response(
          JSON.stringify({
            status: 'ready',
            service: 'laap-api',
            riotConfigured: Boolean(env.RIOT_API_KEY?.trim()),
            tokenConfigured: Boolean(env.LAAP_RIOT_PROXY_TOKEN?.trim()),
            hmacSupported: true,
            timestamp: new Date(clock()).toISOString(),
          }),
          { status: 200, headers },
        )
      }

      if (url.pathname !== '/api/riot/live-status' || (request.method !== 'GET' && request.method !== 'POST')) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
          { status: 404, headers },
        )
      }

      try {
        const bodyBytes = await readBoundedBodyBytes(request)
        const auth = await authorizeRiotProxyHeaders({
          headers: request.headers,
          method: request.method,
          pathAndQuery: `${url.pathname}${url.search}`,
          bodyBytes,
          expectedSecret: env.LAAP_RIOT_PROXY_TOKEN,
          allowStaticToken: env.LAAP_REQUIRE_HMAC !== 'true',
          nonceCache,
          nowMs: clock(),
        })

        if (!auth.ok) {
          if (auth.code === 'UNCONFIGURED') {
            throw new HttpError(
              503,
              'RIOT_PROXY_UNCONFIGURED',
              'LAAP_RIOT_PROXY_TOKEN is not configured on this worker',
            )
          }
          throw new HttpError(
            401,
            'UNAUTHENTICATED',
            'Valid signed LAAP headers (X-Laap-Signature) or proxy token required',
          )
        }

        const callerKey = request.headers.get('cf-connecting-ip')?.trim() || 'proxy-caller'
        const limit = limiter.allow(callerKey)
        if (!limit.allowed) {
          throw new HttpError(
            429,
            'RATE_LIMITED',
            `Too many live-status requests; retry in ${limit.retryAfterSeconds}s`,
            limit.retryAfterSeconds,
          )
        }

        const params = extractLookupParams(request, url, bodyBytes)
        const result = await tracker.lookup(params, env.RIOT_API_KEY ?? '')
        return new Response(JSON.stringify(result), { status: 200, headers })
      } catch (error) {
        if (isHttpError(error)) {
          const errHeaders = buildHeaders(
            allowed ? origin : null,
            fallbackOrigin,
            error.retryAfterSeconds,
          )
          return new Response(
            JSON.stringify({ error: { code: error.code, message: error.message } }),
            { status: error.status, headers: errHeaders },
          )
        }
        return new Response(
          JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected worker error' } }),
          { status: 500, headers },
        )
      }
    },
  }
}

export default createRiotWorker()
