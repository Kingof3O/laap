import { canonicalRank } from '../tiers.ts'
import { leagueChampionIconUrl } from '../assets.ts'
import type { ChampionStat, OpggStats } from '../types.ts'

export function extractLeagueLevel(html: string): number | undefined {
  const htmlMatch = html.match(/class="[^"]*mt-\[-11px\][^"]*"[^>]*>\s*<span[^>]*>(\d+)<\/span>/i)
  if (htmlMatch) {
    const lvl = Number.parseInt(htmlMatch[1], 10)
    if (lvl > 0 && lvl < 50000) return lvl
  }

  const rscMatch =
    html.match(/mt-\[-11px\]\s+text-center"[^}]*?"children":\s*(\d+)/i) ||
    html.match(/mt-\[-11px\][^}]*?text-white"[^}]*?"children":\s*(\d+)/i)
  if (rscMatch) {
    const lvl = Number.parseInt(rscMatch[1], 10)
    if (lvl > 0 && lvl < 50000) return lvl
  }

  const iconIdx = html.indexOf('profile_icons/profileIcon')
  if (iconIdx !== -1) {
    const slice = html.slice(iconIdx, iconIdx + 800)
    const spanMatch =
      slice.match(/<span[^>]*text-white[^>]*>(\d+)<\/span>/i) ||
      slice.match(/text-white"[^}]*?"children":\s*(\d+)/i)
    if (spanMatch) {
      const lvl = Number.parseInt(spanMatch[1], 10)
      if (lvl > 0 && lvl < 50000) return lvl
    }
  }

  return undefined
}

export function extractLeagueAvatarUrl(html: string): string | undefined {
  const match = html.match(/https:\/\/opgg-static\.akamaized\.net\/meta\/images\/profile_icons\/profileIcon\d+\.jpg/i)
  return match ? match[0] : undefined
}

export function parseOpggMetaDescription(
  metaContent: string,
  summonerName: string,
  tagLine: string,
  region: string,
  html?: string,
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

  const topChampions: ChampionStat[] = []
  if (parts.length > 3) {
    const champsPart = parts.slice(3).join(' / ')
    const chunks = champsPart.split(',')
    for (const chunk of chunks) {
      const trimmed = chunk.trim()
      if (!trimmed) continue
      const dashIdx = trimmed.indexOf('-')
      if (dashIdx !== -1) {
        const name = trimmed.slice(0, dashIdx).trim()
        const rest = trimmed.slice(dashIdx + 1).trim()
        if (!name) continue
        const winMatch = rest.match(/(\d+)Win/)
        const loseMatch = rest.match(/(\d+)Lose/)
        const rateMatch = rest.match(/Win\s+rate\s+(\d+)%/)
        const cWins = winMatch ? Number.parseInt(winMatch[1], 10) : 0
        const cLosses = loseMatch ? Number.parseInt(loseMatch[1], 10) : 0
        const cWinRate = rateMatch
          ? Number.parseInt(rateMatch[1], 10)
          : cWins + cLosses > 0
            ? Math.round((cWins / (cWins + cLosses)) * 100)
            : 0
        const iconUrl = leagueChampionIconUrl(name)
        topChampions.push({
          name,
          iconUrl,
          wins: cWins,
          losses: cLosses,
          winRate: cWinRate,
          count: cWins + cLosses,
        })
        if (topChampions.length >= 3) break
      }
    }
  }

  const slug = `${encodeURIComponent(summonerName)}-${encodeURIComponent(tagLine)}`
  const cleanRegion = region.toLowerCase()
  const url = `https://op.gg/lol/summoners/${cleanRegion}/${slug}`
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
    level: html ? extractLeagueLevel(html) : undefined,
    avatarUrl: html ? extractLeagueAvatarUrl(html) : undefined,
    topChampions: topChampions.length > 0 ? topChampions : undefined,
  }
}
