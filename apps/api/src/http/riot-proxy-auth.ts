const TIMESTAMP_SKEW_SECONDS = 60
const MAX_NONCES = 4096

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, '0')
  }
  return out
}

function parseHex32(hex: string): Uint8Array | null {
  const clean = hex.trim()
  if (clean.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(clean)) {
    return null
  }
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

export async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy)
  return new Uint8Array(digest)
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(await sha256Bytes(bytes))
}

export async function signRiotProxyRequest(options: {
  secret: string
  timestamp: string
  nonce: string
  method: string
  pathAndQuery: string
  bodyBytes: Uint8Array
}): Promise<string> {
  const encoder = new TextEncoder()
  const bodyHash = await sha256Hex(options.bodyBytes)
  const canonical = `${options.timestamp}\n${options.nonce}\n${options.method.toUpperCase()}\n${options.pathAndQuery}\n${bodyHash}`
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(options.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(canonical))
  return toHex(new Uint8Array(sigBuffer))
}

export class RiotProxyNonceCache {
  private readonly seen = new Map<string, number>()

  checkAndMark(key: string, nowMs: number, ttlMs = (TIMESTAMP_SKEW_SECONDS + 5) * 1000): boolean {
    for (const [entryKey, expiresAt] of this.seen) {
      if (expiresAt <= nowMs) {
        this.seen.delete(entryKey)
      }
    }
    const existing = this.seen.get(key)
    if (existing !== undefined && existing > nowMs) {
      return false
    }
    if (this.seen.size >= MAX_NONCES) {
      const oldest = this.seen.keys().next().value
      if (oldest !== undefined) {
        this.seen.delete(oldest)
      }
    }
    this.seen.set(key, nowMs + ttlMs)
    return true
  }
}

export function readHeaderValue(
  headers: { get?(name: string): string | null } | Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(name)
  }
  const record = headers as Record<string, string | string[] | undefined>
  const value = record[name.toLowerCase()]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return null
}

function extractStaticProxyToken(
  headers: { get?(name: string): string | null } | Record<string, string | string[] | undefined>,
): string | null {
  const custom = readHeaderValue(headers, 'x-laap-riot-token')?.trim()
  if (custom) return custom
  const auth = readHeaderValue(headers, 'authorization')?.trim()
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim()
    if (token) return token
  }
  return null
}

export async function authorizeRiotProxyHeaders(options: {
  headers: { get?(name: string): string | null } | Record<string, string | string[] | undefined>
  method: string
  pathAndQuery: string
  bodyBytes: Uint8Array
  expectedSecret: string | undefined
  allowStaticToken?: boolean
  nonceCache?: RiotProxyNonceCache
  nowMs?: number
}): Promise<{ ok: true; method: 'hmac' | 'token' } | { ok: false; code: 'UNCONFIGURED' | 'UNAUTHENTICATED' }> {
  const secret = options.expectedSecret?.trim() ?? ''
  if (!secret) {
    return { ok: false, code: 'UNCONFIGURED' }
  }

  const sigHeader = readHeaderValue(options.headers, 'x-laap-signature')?.trim() ?? ''
  const tsHeader = readHeaderValue(options.headers, 'x-laap-timestamp')?.trim() ?? ''
  const nonceHeader = readHeaderValue(options.headers, 'x-laap-nonce')?.trim() ?? ''

  if (sigHeader || tsHeader || nonceHeader) {
    if (!sigHeader || !tsHeader || !nonceHeader) {
      return { ok: false, code: 'UNAUTHENTICATED' }
    }
    if (!/^\d{1,12}$/.test(tsHeader) || !/^[A-Za-z0-9_-]{12,64}$/.test(nonceHeader)) {
      return { ok: false, code: 'UNAUTHENTICATED' }
    }
    const nowMs = options.nowMs ?? Date.now()
    const nowSec = Math.floor(nowMs / 1000)
    const tsSec = Number(tsHeader)
    if (!Number.isSafeInteger(tsSec) || Math.abs(nowSec - tsSec) > TIMESTAMP_SKEW_SECONDS) {
      return { ok: false, code: 'UNAUTHENTICATED' }
    }
    const presentedSig = parseHex32(sigHeader)
    if (!presentedSig) {
      return { ok: false, code: 'UNAUTHENTICATED' }
    }

    const expectedHex = await signRiotProxyRequest({
      secret,
      timestamp: tsHeader,
      nonce: nonceHeader,
      method: options.method,
      pathAndQuery: options.pathAndQuery,
      bodyBytes: options.bodyBytes,
    })
    const expectedBytes = parseHex32(expectedHex)
    if (!expectedBytes || !constantTimeEqualBytes(presentedSig, expectedBytes)) {
      return { ok: false, code: 'UNAUTHENTICATED' }
    }

    if (options.nonceCache && !options.nonceCache.checkAndMark(`${tsHeader}:${nonceHeader}`, nowMs)) {
      return { ok: false, code: 'UNAUTHENTICATED' }
    }
    return { ok: true, method: 'hmac' }
  }

  if (options.allowStaticToken !== true) {
    return { ok: false, code: 'UNAUTHENTICATED' }
  }

  const staticToken = extractStaticProxyToken(options.headers)
  if (!staticToken) {
    return { ok: false, code: 'UNAUTHENTICATED' }
  }
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    sha256Bytes(encoder.encode(staticToken)),
    sha256Bytes(encoder.encode(secret)),
  ])
  if (!constantTimeEqualBytes(a, b)) {
    return { ok: false, code: 'UNAUTHENTICATED' }
  }
  return { ok: true, method: 'token' }
}
