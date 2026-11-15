import { HttpError } from '../http/errors.js'

export interface RiotRouting {
  accountCluster: 'americas' | 'europe' | 'asia'
  platform: string
}

export interface RiotLiveLookupInput {
  region: string
  gameName?: string
  tagLine?: string
  puuid?: string
  bypassCache?: boolean
}

export interface RiotLiveStatus {
  inGame: boolean
  puuid: string
  platform: string
  cached: boolean
  checkedAt: string
  gameId?: number | null
  gameMode?: string | null
  gameType?: string | null
  queueId?: number | null
  gameLengthSeconds?: number | null
  gameStartTime?: number | null
  championId?: number | null
}

type CacheEntry<T> = { value: T; expiresAt: number }

const MAX_CACHE_ENTRIES = 1000
const PUUID_TTL_MS = 24 * 60 * 60 * 1000
const STATUS_TTL_MS = 45 * 1000
const SHORT_WINDOW_MS = 1000
const SHORT_LIMIT = 18
const LONG_WINDOW_MS = 120_000
const LONG_LIMIT = 90
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ROUTING_MAP: Record<string, RiotRouting> = {
  NA: { accountCluster: 'americas', platform: 'na1' },
  NA1: { accountCluster: 'americas', platform: 'na1' },
  BR: { accountCluster: 'americas', platform: 'br1' },
  BR1: { accountCluster: 'americas', platform: 'br1' },
  LAN: { accountCluster: 'americas', platform: 'la1' },
  LA1: { accountCluster: 'americas', platform: 'la1' },
  LAS: { accountCluster: 'americas', platform: 'la2' },
  LA2: { accountCluster: 'americas', platform: 'la2' },
  EUW: { accountCluster: 'europe', platform: 'euw1' },
  EUW1: { accountCluster: 'europe', platform: 'euw1' },
  EUNE: { accountCluster: 'europe', platform: 'eun1' },
  EUN1: { accountCluster: 'europe', platform: 'eun1' },
  TR: { accountCluster: 'europe', platform: 'tr1' },
  TR1: { accountCluster: 'europe', platform: 'tr1' },
  RU: { accountCluster: 'europe', platform: 'ru' },
  ME: { accountCluster: 'europe', platform: 'me1' },
  ME1: { accountCluster: 'europe', platform: 'me1' },
  KR: { accountCluster: 'asia', platform: 'kr' },
  JP: { accountCluster: 'asia', platform: 'jp1' },
  JP1: { accountCluster: 'asia', platform: 'jp1' },
  OCE: { accountCluster: 'asia', platform: 'oc1' },
  OC1: { accountCluster: 'asia', platform: 'oc1' },
  SEA: { accountCluster: 'asia', platform: 'sg2' },
  SG: { accountCluster: 'asia', platform: 'sg2' },
  SG2: { accountCluster: 'asia', platform: 'sg2' },
  PH: { accountCluster: 'asia', platform: 'sg2' },
  PH2: { accountCluster: 'asia', platform: 'sg2' },
  TH: { accountCluster: 'asia', platform: 'sg2' },
  TH2: { accountCluster: 'asia', platform: 'sg2' },
  TW: { accountCluster: 'asia', platform: 'tw2' },
  TW2: { accountCluster: 'asia', platform: 'tw2' },
  VN: { accountCluster: 'asia', platform: 'vn2' },
  VN2: { accountCluster: 'asia', platform: 'vn2' },
}

export function resolveRiotRouting(region: string): RiotRouting {
  const key = region.trim().toUpperCase()
  const routing = ROUTING_MAP[key]
  if (!routing) throw new HttpError(400, 'INVALID_REGION', 'Unsupported Riot platform region')
  return routing
}

function setBounded<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number, now: number) {
  if (cache.has(key)) cache.delete(key)
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  cache.set(key, { value, expiresAt: now + ttlMs })
}

function getFresh<T>(cache: Map<string, CacheEntry<T>>, key: string, now: number): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= now) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

function parseRetryAfter(raw: string | null): number {
  const parsed = Number(raw ?? '60')
  if (!Number.isFinite(parsed) || parsed <= 0) return 60
  return Math.max(1, Math.min(300, Math.ceil(parsed)))
}

/**
 * Queries Riot account-v1 and spectator-v5 with bounded caching, single-flight
 * deduplication, and per-platform rate-limit protection for personal/production keys.
 */
export class RiotLiveTracker {
  private readonly puuidCache = new Map<string, CacheEntry<string>>()
  private readonly statusCache = new Map<string, CacheEntry<RiotLiveStatus>>()
  private readonly inflight = new Map<string, Promise<RiotLiveStatus>>()
  private readonly retryUntilByPlatform = new Map<string, number>()
  private readonly requestLogByPlatform = new Map<string, number[]>()

  constructor(
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
    private readonly clock: () => number = () => Date.now(),
  ) {}

  private assertQuotaAvailable(platform: string) {
    const now = this.clock()
    const cooldownUntil = this.retryUntilByPlatform.get(platform) ?? 0
    if (cooldownUntil > now) {
      const waitSeconds = Math.max(1, Math.ceil((cooldownUntil - now) / 1000))
      throw new HttpError(
        429,
        'RIOT_RATE_LIMITED',
        `Riot API cooldown active for ${platform}; retry in ${waitSeconds}s`,
        waitSeconds,
      )
    }

    const recent = (this.requestLogByPlatform.get(platform) ?? []).filter((ts) => ts > now - LONG_WINDOW_MS)
    const shortCount = recent.filter((ts) => ts > now - SHORT_WINDOW_MS).length
    if (shortCount >= SHORT_LIMIT) {
      throw new HttpError(429, 'RIOT_RATE_LIMITED', 'Riot 1-second burst window reached; retry shortly', 1)
    }
    if (recent.length >= LONG_LIMIT) {
      const waitSeconds = Math.max(1, Math.ceil((recent[0] + LONG_WINDOW_MS - now) / 1000))
      throw new HttpError(
        429,
        'RIOT_RATE_LIMITED',
        `Riot 2-minute rate budget protected; retry in ${waitSeconds}s`,
        waitSeconds,
      )
    }
    recent.push(now)
    this.requestLogByPlatform.set(platform, recent)
  }

  private async fetchJson<T>(
    url: string,
    apiKey: string,
    platform: string,
    allowStatuses: number[] = [],
  ): Promise<{ status: number; data: T | null }> {
    this.assertQuotaAvailable(platform)
    let response: Response
    try {
      const doFetch = this.fetchImpl
      response = await doFetch(url, {
        method: 'GET',
        headers: { 'X-Riot-Token': apiKey },
        signal: AbortSignal.timeout(8_000),
      })
    } catch {
      throw new HttpError(502, 'RIOT_API_UNREACHABLE', 'Unable to reach Riot Games API')
    }

    if (response.status === 429) {
      const waitSeconds = parseRetryAfter(response.headers.get('retry-after'))
      this.retryUntilByPlatform.set(platform, this.clock() + waitSeconds * 1000)
      throw new HttpError(
        429,
        'RIOT_RATE_LIMITED',
        `Riot API rate limit reached; retry in ${waitSeconds}s`,
        waitSeconds,
      )
    }
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(502, 'RIOT_API_AUTH_FAILED', 'Configured Riot API key was rejected')
    }
    if (allowStatuses.includes(response.status)) {
      return { status: response.status, data: null }
    }
    if (response.status === 404) {
      throw new HttpError(404, 'RIOT_ACCOUNT_NOT_FOUND', 'Riot ID was not found')
    }
    if (!response.ok) {
      throw new HttpError(502, 'RIOT_API_ERROR', `Riot API returned HTTP ${response.status}`)
    }
    try {
      return { status: response.status, data: (await response.json()) as T }
    } catch {
      throw new HttpError(502, 'RIOT_API_INVALID_RESPONSE', 'Riot API returned invalid JSON')
    }
  }

  async lookup(input: RiotLiveLookupInput, apiKey: string): Promise<RiotLiveStatus> {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      throw new HttpError(503, 'RIOT_PROXY_UNCONFIGURED', 'RIOT_API_KEY is not configured on this worker')
    }

    const routing = resolveRiotRouting(input.region)
    let cleanPuuid = input.puuid?.trim() ?? ''
    const cleanName = input.gameName?.trim() ?? ''
    const cleanTag = input.tagLine?.trim() ?? ''

    if (cleanPuuid && UUID_RE.test(cleanPuuid)) {
      // LCU / Riot Client RSO sub is a 36-char UUID, whereas Spectator v5 requires an app-encrypted PUUID.
      if (cleanName && cleanTag) {
        cleanPuuid = ''
      } else {
        throw new HttpError(
          400,
          'INVALID_PUUID',
          'Local Riot UUID cannot query Spectator API; provide Riot ID #TAG or an encrypted PUUID',
        )
      }
    }

    if (cleanPuuid) {
      if (cleanPuuid.length > 150 || /\s|\//.test(cleanPuuid) || hasControlChars(cleanPuuid)) {
        throw new HttpError(400, 'INVALID_PUUID', 'PUUID format is invalid')
      }
    } else if (
      !cleanName ||
      !cleanTag ||
      cleanName.length > 32 ||
      cleanTag.length > 16 ||
      hasControlChars(cleanName) ||
      hasControlChars(cleanTag)
    ) {
      throw new HttpError(400, 'INVALID_RIOT_ID', 'Provide either a valid puuid or both gameName and tagLine')
    }

    const identityKey = cleanPuuid
      ? `${routing.platform}\0p\0${cleanPuuid}`
      : `${routing.platform}\0n\0${cleanName.toLowerCase()}\0${cleanTag.toLowerCase()}`

    const existingPromise = this.inflight.get(identityKey)
    if (existingPromise) return existingPromise

    const puuidCacheKey =
      cleanName && cleanTag
        ? `${routing.platform}\0${cleanName.toLowerCase()}\0${cleanTag.toLowerCase()}`
        : null

    const resolvePuuidFromRiotId = async (): Promise<string> => {
      if (puuidCacheKey) {
        const cached = getFresh(this.puuidCache, puuidCacheKey, this.clock())
        if (cached) return cached
      }
      const accountUrl = `https://${routing.accountCluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(cleanName)}/${encodeURIComponent(cleanTag)}`
      const { data } = await this.fetchJson<{ puuid?: string }>(accountUrl, trimmedKey, routing.platform)
      if (!data?.puuid || data.puuid.length > 150) {
        throw new HttpError(502, 'RIOT_API_INVALID_RESPONSE', 'Riot Account API omitted puuid')
      }
      if (puuidCacheKey) {
        setBounded(this.puuidCache, puuidCacheKey, data.puuid, PUUID_TTL_MS, this.clock())
      }
      return data.puuid
    }

    const run = async (): Promise<RiotLiveStatus> => {
      let resolvedPuuid = cleanPuuid || (await resolvePuuidFromRiotId())

      const statusKey = `${routing.platform}\0${resolvedPuuid}`
      if (!input.bypassCache) {
        const cached = getFresh(this.statusCache, statusKey, this.clock())
        if (cached) return { ...cached, cached: true }
      }

      type SpectatorPayload = {
        gameId?: number
        gameMode?: string
        gameType?: string
        gameQueueConfigId?: number
        gameLength?: number
        gameStartTime?: number
        participants?: Array<{ puuid?: string; championId?: number }>
      }
      const querySpectator = (puuidValue: string) =>
        this.fetchJson<SpectatorPayload>(
          `https://${routing.platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuidValue)}`,
          trimmedKey,
          routing.platform,
          [400, 404],
        )

      let { status, data } = await querySpectator(resolvedPuuid)
      if (status === 400 && puuidCacheKey) {
        // Stale/wrong-app encrypted PUUID (e.g. rotated RIOT_API_KEY): clear cache and resolve fresh PUUID once.
        this.puuidCache.delete(puuidCacheKey)
        resolvedPuuid = await resolvePuuidFromRiotId()
        const retry = await querySpectator(resolvedPuuid)
        status = retry.status
        data = retry.data
      }
      if (status === 400) {
        throw new HttpError(
          400,
          'RIOT_INVALID_PUUID',
          'Riot rejected stored PUUID; refresh with Riot ID #TAG to re-resolve',
        )
      }
      const now = this.clock()
      const checkedAt = new Date(now).toISOString()

      const result: RiotLiveStatus = status === 404 || !data
        ? {
            inGame: false,
            puuid: resolvedPuuid,
            platform: routing.platform,
            cached: false,
            checkedAt,
          }
        : {
            inGame: true,
            puuid: resolvedPuuid,
            platform: routing.platform,
            cached: false,
            checkedAt,
            gameId: typeof data.gameId === 'number' ? data.gameId : null,
            gameMode: typeof data.gameMode === 'string' ? data.gameMode : null,
            gameType: typeof data.gameType === 'string' ? data.gameType : null,
            queueId: typeof data.gameQueueConfigId === 'number' ? data.gameQueueConfigId : null,
            gameLengthSeconds: typeof data.gameLength === 'number' ? data.gameLength : null,
            gameStartTime: typeof data.gameStartTime === 'number' ? data.gameStartTime : null,
            championId: data.participants?.find((p) => p.puuid === resolvedPuuid)?.championId ?? null,
          }

      const effectiveStatusKey = `${routing.platform}\0${resolvedPuuid}`
      setBounded(this.statusCache, effectiveStatusKey, result, STATUS_TTL_MS, now)
      return result
    }

    const promise = run().finally(() => {
      if (this.inflight.get(identityKey) === promise) {
        this.inflight.delete(identityKey)
      }
    })
    this.inflight.set(identityKey, promise)
    return promise
  }
}
