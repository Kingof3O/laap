import { invokeTauri, isTauriAvailable, openExternalUrl } from '../api.ts'
import type { Game } from '../types.ts'
import type { ChampionStat, CombatStats, OpggStats } from './types.ts'
import { canonicalRank } from './tiers.ts'
import { getLocalStats, getOpggSummonerUrl, saveLocalStats, statsKey } from './cache.ts'
import { parseOpggMetaDescription } from './scrapers/league.ts'
import { parseOpggValorantHtml } from './scrapers/valorant.ts'

export const inFlightRequests = new Map<string, Promise<OpggStats | null>>()

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

export async function performFetchOpggStats(
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
        const topChampions = Array.isArray(raw.topChampions ?? raw.top_champions)
          ? ((raw.topChampions ?? raw.top_champions) as ChampionStat[])
          : undefined
        const combatStats =
          (raw.combatStats ?? raw.combat_stats) &&
          typeof (raw.combatStats ?? raw.combat_stats) === 'object'
            ? ((raw.combatStats ?? raw.combat_stats) as CombatStats)
            : undefined
        const rr = typeof raw.rr === 'number' ? raw.rr : undefined
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
          rr,
          topChampions,
          combatStats,
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
          return parseOpggMetaDescription(
            match[1],
            info.summonerName,
            info.tagLine,
            info.region,
            html,
          )
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
  if (
    !isTauriAvailable() ||
    !getOpggSummonerUrl(account.name, account.region, riotId, game).hasTag
  ) {
    return false
  }
  try {
    const stats = await fetchOpggStats(account.name, account.region, account.riotId, false, game)
    if (!stats) return false
    const rank = (
      stats.formattedRank || (stats as { formatted_rank?: string }).formatted_rank
    )?.trim()
    const currentRank =
      game === 'valorant' ? (account.valorant_rank ?? account.valorantRank) : account.rank
    const avatarUrl = stats.avatarUrl || (stats as { avatar_url?: string }).avatar_url
    const nextRank =
      rank && rank.toLowerCase() !== 'unranked' && rank !== currentRank ? rank : undefined
    if (!nextRank && !avatarUrl) return false
    const updated = await invokeTauri<boolean>('apply_opgg_profile', {
      id: account.id,
      update: {
        riotId,
        region: account.region,
        game,
        puuid: stats.puuid,
        rank: nextRank,
        avatarUrl,
      },
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
