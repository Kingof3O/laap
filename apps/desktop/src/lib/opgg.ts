import { invokeTauri, isTauriAvailable, openExternalUrl } from './api'
import { canonicalRank } from './profileCustomization'

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

export function getOpggSummonerUrl(name: string, region: string): {
  url: string
  slug: string
  summonerName: string
  tagLine: string
  region: string
} {
  let summonerName = name.trim()
  let tagLine = region.trim().toUpperCase()
  if (summonerName.includes('#')) {
    const parts = summonerName.split('#')
    summonerName = parts[0].trim()
    tagLine = parts.slice(1).join('#').trim() || tagLine
  }
  const opggRegion = normalizeOpggRegion(region)
  const slug = `${encodeURIComponent(summonerName)}-${encodeURIComponent(tagLine)}`
  const url = `https://op.gg/lol/summoners/${opggRegion}/${slug}`
  return {
    url,
    slug,
    summonerName,
    tagLine,
    region: opggRegion,
  }
}

const statsCache = new Map<string, { stats: OpggStats; time: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

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

  const { url } = getOpggSummonerUrl(`${summonerName}#${tagLine}`, region)
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
    formattedWinRate: `${wins}W - ${losses}L (${winRate}%)`,
    opggUrl: url,
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}

export async function fetchOpggStats(
  name: string,
  region: string,
): Promise<OpggStats | null> {
  const info = getOpggSummonerUrl(name, region)
  const cacheKey = `${info.region}:${info.summonerName.toLowerCase()}:${info.tagLine.toLowerCase()}`

  const cached = statsCache.get(cacheKey)
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.stats
  }

  if (isTauriAvailable()) {
    try {
      const result = await invokeTauri<OpggStats>('fetch_opgg_summoner_stats', {
        summonerName: info.summonerName,
        tagLine: info.tagLine,
        region: info.region,
      })
      if (result) {
        statsCache.set(cacheKey, { stats: result, time: Date.now() })
        return result
      }
    } catch {
      // Fall through to browser or mock if native invoke fails
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
      const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
      if (match) {
        const parsed = parseOpggMetaDescription(match[1], info.summonerName, info.tagLine, info.region)
        statsCache.set(cacheKey, { stats: parsed, time: Date.now() })
        return parsed
      }
    }
  } catch {
    // Web fetch failed (e.g. CORS in browser environment)
  }

  return null
}

export async function autoSyncAccountRank(account: {
  id: string
  name: string
  region: string
  rank?: string | null
}): Promise<boolean> {
  try {
    const stats = await fetchOpggStats(account.name, account.region)
    if (!stats || !stats.formattedRank || stats.formattedRank === 'Unranked') {
      return false
    }

    if (account.rank !== stats.formattedRank && isTauriAvailable()) {
      const updated = await invokeTauri<boolean>('update_account_rank', {
        id: account.id,
        rank: stats.formattedRank,
      })
      if (updated) {
        window.dispatchEvent(new Event('laap:refresh'))
        return true
      }
    }
  } catch {
    // Fail silently without disrupting user experience
  }
  return false
}

export function openOpggProfile(name: string, region: string): Promise<void> {
  const { url } = getOpggSummonerUrl(name, region)
  return openExternalUrl(url)
}
