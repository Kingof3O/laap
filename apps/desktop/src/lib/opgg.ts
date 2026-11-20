import { invokeTauri, isTauriAvailable, openExternalUrl } from './api.ts'
import { canonicalRank } from './profileCustomization.ts'
import type { Game } from './types.ts'

export interface OpggStats {
  summonerName: string
  tagLine: string
  region: string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
  winRate: number
  formattedRank: string
  formattedWinRate: string
  opggUrl: string
  fetchedAt: number
  game?: Game
  level?: number
  puuid?: string
  avatarUrl?: string
}

export function normalizeOpggRegion(region?: string | null): string {
  if (!region) return 'euw'
  const raw = region.trim().toLowerCase()
  if (raw.startsWith('euw')) return 'euw'
  if (raw.startsWith('eun')) return 'eune'
  if (raw.startsWith('na')) return 'na'
  if (raw.startsWith('kr')) return 'kr'
  if (raw.startsWith('br')) return 'br'
  if (raw.startsWith('lan') || raw === 'la1') return 'lan'
  if (raw.startsWith('las') || raw === 'la2') return 'las'
  if (raw.startsWith('oc')) return 'oce'
  if (raw.startsWith('tr')) return 'tr'
  if (raw.startsWith('ru')) return 'ru'
  if (raw.startsWith('jp')) return 'jp'
  if (raw.startsWith('me')) return 'me'
  if (raw.startsWith('sg')) return 'sg'
  if (raw.startsWith('tw')) return 'tw'
  if (raw.startsWith('vn')) return 'vn'
  if (raw.startsWith('ph')) return 'ph'
  if (raw.startsWith('th')) return 'th'
  return raw
}

export function valorantTierToRank(tier: number): string {
  switch (tier) {
    case 0:
    case 1:
    case 2:
      return 'Unranked'
    case 3:
      return 'Iron 1'
    case 4:
      return 'Iron 2'
    case 5:
      return 'Iron 3'
    case 6:
      return 'Bronze 1'
    case 7:
      return 'Bronze 2'
    case 8:
      return 'Bronze 3'
    case 9:
      return 'Silver 1'
    case 10:
      return 'Silver 2'
    case 11:
      return 'Silver 3'
    case 12:
      return 'Gold 1'
    case 13:
      return 'Gold 2'
    case 14:
      return 'Gold 3'
    case 15:
      return 'Platinum 1'
    case 16:
      return 'Platinum 2'
    case 17:
      return 'Platinum 3'
    case 18:
      return 'Diamond 1'
    case 19:
      return 'Diamond 2'
    case 20:
      return 'Diamond 3'
    case 21:
      return 'Ascendant 1'
    case 22:
      return 'Ascendant 2'
    case 23:
      return 'Ascendant 3'
    case 24:
      return 'Immortal 1'
    case 25:
      return 'Immortal 2'
    case 26:
      return 'Immortal 3'
    case 27:
      return 'Radiant'
    default:
      return 'Unranked'
  }
}

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

const statsCache = new Map<string, { stats: OpggStats; time: number }>()
const inFlightRequests = new Map<string, Promise<OpggStats | null>>()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour fresh TTL
const STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours max persisted cache
const LOCAL_STORAGE_PREFIX = 'laap:opgg_stats_cache:'

function statsKey({ game, region, summonerName, tagLine }: ReturnType<typeof getOpggSummonerUrl>): string {
  const riotId = `${summonerName.toLowerCase()}#${tagLine.toLowerCase()}`
  return game === 'league' ? `opgg:league:${region}:${riotId}` : `opgg:valorant:${riotId}`
}

interface PersistedStatsEntry {
  stats: OpggStats
  cachedAt: number
}

function getLocalStats(cacheKey: string): { stats: OpggStats; isStale: boolean } | null {
  const mem = statsCache.get(cacheKey)
  if (mem) {
    const age = Date.now() - mem.time
    if (age >= 0 && age < STALE_MAX_AGE_MS) {
      return { stats: mem.stats, isStale: age >= CACHE_TTL_MS }
    }
    statsCache.delete(cacheKey)
  }

  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${cacheKey}`) : null
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedStatsEntry
      if (parsed && parsed.stats && typeof parsed.cachedAt === 'number') {
        const age = Date.now() - parsed.cachedAt
        if (age >= 0 && age < STALE_MAX_AGE_MS) {
          statsCache.set(cacheKey, { stats: parsed.stats, time: parsed.cachedAt })
          return { stats: parsed.stats, isStale: age >= CACHE_TTL_MS }
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return null
}

function saveLocalStats(cacheKey: string, stats: OpggStats) {
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
  inFlightRequests.clear()
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

export function parseOpggMetaDescription(
  metaContent: string,
  summonerName: string,
  tagLine: string,
  region: string,
): OpggStats {
  const parts = metaContent.split(' / ')
  let tier = 'UNRANKED'
  let rank = ''
  let lp = 0
  let wins = 0
  let losses = 0
  let winRate = 0

  if (parts.length > 1) {
    const rankPart = parts[1].trim()
    if (rankPart.includes('LP')) {
      const match = rankPart.match(/^([A-Za-z]+)(?:\s+([1-4]))?\s+(\d+)\s+LP$/i)
      if (match) {
        tier = match[1]
        rank = match[2] || ''
        lp = Number.parseInt(match[3], 10) || 0
      }
    }
  }

  if (parts.length > 2) {
    const recordPart = parts[2].trim()
    const wlMatch = recordPart.match(/(\d+)Win\s+(\d+)Lose(?:\s+Win\s+rate\s+(\d+)%)?/i)
    if (wlMatch) {
      wins = Number.parseInt(wlMatch[1], 10) || 0
      losses = Number.parseInt(wlMatch[2], 10) || 0
      winRate = wlMatch[3]
        ? Number.parseInt(wlMatch[3], 10) || 0
        : wins + losses > 0
          ? Math.round((wins / (wins + losses)) * 100)
          : 0
    }
  }

  const { url } = getOpggSummonerUrl(`${summonerName}#${tagLine}`, region, undefined, 'league')
  const canonical = canonicalRank(
    tier.toLowerCase() === 'unranked'
      ? 'Unranked'
      : rank
        ? `${tier} ${rank} (${lp} LP)`
        : `${tier} (${lp} LP)`,
  )

  return {
    summonerName,
    tagLine,
    region,
    tier,
    rank,
    leaguePoints: lp,
    wins,
    losses,
    winRate,
    formattedRank: canonical,
    formattedWinRate:
      wins + losses === 0
        ? 'Unranked (0 games)'
        : `${wins}W - ${losses}L (${winRate}%)`,
    opggUrl: url,
    fetchedAt: Math.floor(Date.now() / 1000),
    game: 'league',
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
  const stats = getOpggCachedStats(nameOrRiotId, region, game) as (OpggStats & { avatar_url?: string }) | null
  return stats?.avatarUrl || stats?.avatar_url || null
}

export function getOpggCachedRank(
  nameOrRiotId: string,
  region: string,
  game: Game = 'league',
): string | null {
  const stats = getOpggCachedStats(nameOrRiotId, region, game) as (OpggStats & { formatted_rank?: string }) | null
  const r = stats?.formattedRank || stats?.formatted_rank
  return r && r !== 'Unranked' ? r : null
}

export function parseOpggValorantHtml(
  html: string,
  summonerName: string,
  tagLine: string,
  region: string,
): OpggStats | null {
  const match = html.match(/\\?"profile\\?"\s*:\s*(\{.+?\})/s) || html.match(/"profile"\s*:\s*(\{.+?\})/s)
  if (!match) return null

  try {
    let jsonStr = match[1]
    if (jsonStr.includes('\\"')) {
      jsonStr = jsonStr.replace(/\\"/g, '"')
    }
    const data = JSON.parse(jsonStr) as {
      gameName?: string
      tagLine?: string
      level?: number
      region?: string
      competitiveTier?: number
      puuid?: string
    }

    const tierNum = typeof data.competitiveTier === 'number' ? data.competitiveTier : 0
    const formattedRank = valorantTierToRank(tierNum)
    const spaceIdx = formattedRank.indexOf(' ')
    const tier = spaceIdx !== -1 ? formattedRank.slice(0, spaceIdx) : formattedRank
    const rank = spaceIdx !== -1 ? formattedRank.slice(spaceIdx + 1) : ''
    const finalName = data.gameName || summonerName
    const finalTag = data.tagLine || tagLine
    const { url } = getOpggSummonerUrl(`${finalName}#${finalTag}`, region, undefined, 'valorant')

    const cardMatch =
      html.match(/https:\/\/c-valorant-api\.op\.gg\/Assets\/PlayerCards\/[a-zA-Z0-9_\-]+(?:_small)?\.png/i) ||
      html.match(/https?:\/\/[^"'\s\\]*(?:playercards|player-cards|PlayerCards)[^"'\s\\]*\.(?:png|webp|jpg)/i)
    const avatarUrl = cardMatch ? cardMatch[0] : undefined

    return {
      summonerName: finalName,
      tagLine: finalTag,
      region: data.region || region,
      tier,
      rank,
      leaguePoints: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      formattedRank,
      formattedWinRate: 'Unranked (0 games)',
      opggUrl: url,
      fetchedAt: Math.floor(Date.now() / 1000),
      game: 'valorant',
      level: data.level,
      puuid: data.puuid,
      avatarUrl,
    }
  } catch {
    return null
  }
}

export async function fetchOpggStats(
  name: string,
  region: string,
  explicitRiotId?: string | null,
  forceRefresh = false,
  game: Game = 'league',
): Promise<OpggStats | null> {
  const info = getOpggSummonerUrl(name, region, explicitRiotId, game)
  if (!info.hasTag && (game === 'valorant' || explicitRiotId)) return null
  const cacheKey = statsKey(info)
  const cached = getLocalStats(cacheKey)
  if (!forceRefresh && cached && !cached.isStale) return cached.stats

  // Deduplicate in-flight network requests
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!
  }

  const reqPromise = performFetchOpggStats(info, game)
    .then((result) => {
      if (result && inFlightRequests.get(cacheKey) === reqPromise) {
        saveLocalStats(cacheKey, result)
      }
      return result
    })
    .finally(() => {
      if (inFlightRequests.get(cacheKey) === reqPromise) inFlightRequests.delete(cacheKey)
    })

  inFlightRequests.set(cacheKey, reqPromise)
  return reqPromise
}

async function performFetchOpggStats(
  info: { summonerName: string; tagLine: string; region: string; url: string },
  game: Game,
): Promise<OpggStats | null> {
  if (isTauriAvailable()) {
    try {
      const raw = await invokeTauri<Record<string, unknown>>('fetch_opgg_summoner_stats', {
        summonerName: info.summonerName,
        tagLine: info.tagLine,
        region: info.region,
        game,
      })
      if (raw) {
        const tier = String(raw.tier ?? '')
        const rank = String(raw.rank ?? '')
        const resolvedRank =
          (typeof raw.formattedRank === 'string' && raw.formattedRank) ||
          (typeof raw.formatted_rank === 'string' && raw.formatted_rank) ||
          canonicalRank(tier ? `${tier} ${rank}`.trim() : 'Unranked')
        const resolvedAvatar =
          (typeof raw.avatarUrl === 'string' && raw.avatarUrl) ||
          (typeof raw.avatar_url === 'string' && raw.avatar_url) ||
          undefined
        const normalized: OpggStats = {
          summonerName: String(raw.summonerName ?? raw.summoner_name ?? info.summonerName),
          tagLine: String(raw.tagLine ?? raw.tag_line ?? info.tagLine),
          region: String(raw.region ?? info.region),
          tier,
          rank,
          leaguePoints: Number(raw.leaguePoints ?? raw.league_points ?? 0),
          wins: Number(raw.wins ?? 0),
          losses: Number(raw.losses ?? 0),
          winRate: Number(raw.winRate ?? raw.win_rate ?? 0),
          formattedRank: resolvedRank,
          formattedWinRate: String(raw.formattedWinRate ?? raw.formatted_win_rate ?? ''),
          opggUrl: String(raw.opggUrl ?? raw.opgg_url ?? info.url),
          fetchedAt: Number(raw.fetchedAt ?? raw.fetched_at ?? Math.floor(Date.now() / 1000)),
          game: (raw.game as Game) ?? game,
          level: typeof raw.level === 'number' ? raw.level : undefined,
          puuid: typeof raw.puuid === 'string' ? raw.puuid : undefined,
          avatarUrl: resolvedAvatar,
        }
        return normalized
      }
    } catch (e) {
      throw e
    }
  }

  // Fallback for mock/test/web environment or fallback to client fetch if possible
  try {
    const res = await fetch(info.url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    if (res.ok) {
      const html = await res.text()
      if (game === 'valorant') {
        const parsed = parseOpggValorantHtml(html, info.summonerName, info.tagLine, info.region)
        if (parsed) return parsed
      } else {
        const match =
          html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
          html.match(/<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i)
        if (match) {
          return parseOpggMetaDescription(match[1], info.summonerName, info.tagLine, info.region)
        }
      }
    }
  } catch {
    // Web fetch failed (e.g. CORS in browser environment)
  }

  return null
}

export async function autoSyncAccountRank(
  account: {
    id: string
    name: string
    region: string
    rank?: string | null
    valorant_rank?: string | null
    valorantRank?: string | null
    riotId?: string | null
  },
  game: Game = 'league',
): Promise<boolean> {
  const riotId = account.riotId || account.name
  if (!isTauriAvailable() || !getOpggSummonerUrl(account.name, account.region, riotId, game).hasTag) {
    return false
  }
  try {
    const stats = await fetchOpggStats(account.name, account.region, account.riotId, false, game)
    if (!stats) return false
    const rank = (stats.formattedRank || (stats as { formatted_rank?: string }).formatted_rank)?.trim()
    const currentRank = game === 'valorant'
      ? (account.valorant_rank ?? account.valorantRank)
      : account.rank
    const avatarUrl = stats.avatarUrl || (stats as { avatar_url?: string }).avatar_url
    const nextRank = rank && rank.toLowerCase() !== 'unranked' && rank !== currentRank ? rank : undefined
    if (!nextRank && !avatarUrl) return false
    const updated = await invokeTauri<boolean>('apply_opgg_profile', {
      id: account.id,
      update: { riotId, region: account.region, game, puuid: stats.puuid, rank: nextRank, avatarUrl },
    })
    if (updated) window.dispatchEvent(new Event('laap:refresh'))
    return updated
  } catch {
    // Fail silently without disrupting user experience
  }
  return false
}

export function openOpggProfile(
  name: string,
  region: string,
  riotId?: string | null,
  game: Game = 'league',
): Promise<void> {
  const { url } = getOpggSummonerUrl(name, region, riotId, game)
  return openExternalUrl(url)
}
