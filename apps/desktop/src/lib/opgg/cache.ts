import type { Game } from '../types.ts'
import type { OpggStats } from './types.ts'
import { normalizeOpggRegion } from './tiers.ts'

export const statsCache = new Map<string, { stats: OpggStats; time: number }>()
export const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour fresh TTL
export const STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours max persisted cache
export const LOCAL_STORAGE_PREFIX = 'laap:opgg_stats_cache_v2:'

export function getOpggSummonerUrl(
  name: string,
  region: string,
  explicitRiotId?: string | null,
  game: Game = 'league',
): {
  url: string
  slug: string
  summonerName: string
  tagLine: string
  region: string
  hasTag: boolean
  game: Game
} {
  const target = (explicitRiotId && explicitRiotId.trim()) || name.trim()
  let summonerName = target
  let tagLine = region.trim().toUpperCase()
  let hasTag = false

  if (target.includes('#')) {
    const parts = target.split('#')
    summonerName = parts[0].trim()
    const explicitTag = parts[1]?.trim()
    hasTag = parts.length === 2 && Boolean(summonerName && explicitTag)
    if (hasTag) tagLine = explicitTag
  }
  const opggRegion = normalizeOpggRegion(region)
  const slug = `${encodeURIComponent(summonerName)}-${encodeURIComponent(tagLine)}`
  const url =
    game === 'valorant'
      ? `https://op.gg/valorant/profile/${slug}`
      : `https://op.gg/lol/summoners/${opggRegion}/${slug}`

  return {
    url,
    slug,
    summonerName,
    tagLine,
    region: opggRegion,
    hasTag,
    game,
  }
}

export function statsKey({
  game,
  region,
  summonerName,
  tagLine,
}: ReturnType<typeof getOpggSummonerUrl>): string {
  const riotId = `${summonerName.toLowerCase()}#${tagLine.toLowerCase()}`
  return game === 'league' ? `opgg:league:${region}:${riotId}` : `opgg:valorant:${riotId}`
}

export interface PersistedStatsEntry {
  stats: OpggStats
  cachedAt: number
}

export function getLocalStats(cacheKey: string): { stats: OpggStats; isStale: boolean } | null {
  const mem = statsCache.get(cacheKey)
  if (mem) {
    const age = Date.now() - mem.time
    if (age >= 0 && age < STALE_MAX_AGE_MS) {
      return { stats: mem.stats, isStale: age >= CACHE_TTL_MS }
    }
    statsCache.delete(cacheKey)
  }

  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${cacheKey}`)
        : null
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedStatsEntry
      if (parsed && parsed.stats && typeof parsed.cachedAt === 'number') {
        const age = Date.now() - parsed.cachedAt
        if (age >= 0 && age < STALE_MAX_AGE_MS) {
          statsCache.set(cacheKey, { stats: parsed.stats, time: parsed.cachedAt })
          const missingHeroes = parsed.stats.topChampions === undefined
          return { stats: parsed.stats, isStale: missingHeroes || age >= CACHE_TTL_MS }
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return null
}

export function saveLocalStats(cacheKey: string, stats: OpggStats) {
  const now = Date.now()
  statsCache.set(cacheKey, { stats, time: now })
  try {
    if (typeof localStorage !== 'undefined') {
      const entry: PersistedStatsEntry = { stats, cachedAt: now }
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${cacheKey}`, JSON.stringify(entry))
    }
  } catch {
    // ignore storage errors
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('laap:opgg-updated'))
}

export function clearOpggCache(): void {
  statsCache.clear()
  try {
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith(LOCAL_STORAGE_PREFIX)) keysToRemove.push(k)
      }
      for (const k of keysToRemove) localStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
}

export function getOpggCachedStats(
  nameOrRiotId: string,
  region: string,
  game: Game,
): OpggStats | null {
  const info = getOpggSummonerUrl(nameOrRiotId, region, undefined, game)
  return info.hasTag ? getLocalStats(statsKey(info))?.stats ?? null : null
}

export function getOpggCachedAvatar(
  nameOrRiotId: string,
  region: string,
  game: Game = 'valorant',
): string | null {
  const stats = getOpggCachedStats(nameOrRiotId, region, game) as
    | (OpggStats & { avatar_url?: string })
    | null
  return stats?.avatarUrl || stats?.avatar_url || null
}

export function getOpggCachedRank(
  nameOrRiotId: string,
  region: string,
  game: Game = 'league',
): string | null {
  const stats = getOpggCachedStats(nameOrRiotId, region, game) as
    | (OpggStats & { formatted_rank?: string })
    | null
  const r = stats?.formattedRank || stats?.formatted_rank
  return r && r !== 'Unranked' ? r : null
}
