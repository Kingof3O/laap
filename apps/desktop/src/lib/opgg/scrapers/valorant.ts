import { valorantAgentFromId, valorantAgentIconUrl } from '../assets.ts'
import { valorantTierToRank } from '../tiers.ts'
import type { ChampionStat, OpggStats } from '../types.ts'

export function extractValorantAgents(html: string): ChampionStat[] {
  const agents: ChampionStat[] = []
  const text = html.includes('\\"') ? html.replace(/\\"/g, '"') : html
  const regex = /"(?:agentName|characterName)":\s*"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    const name = m[1].trim()
    if (!name || name.length > 30 || agents.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      continue
    }
    const slice = text.slice(m.index, Math.min(text.length, m.index + 600))
    const winMatch = slice.match(/"wins?":\s*(\d+)/)
    const loseMatch = slice.match(/"los(?:es|e)":\s*(\d+)/)
    const playMatch = slice.match(/"(?:play|games)":\s*(\d+)/)
    const rateMatch = slice.match(/"winRate":\s*(\d+)/)
    const cWins = winMatch ? Number.parseInt(winMatch[1], 10) : 0
    const cLosses = loseMatch ? Number.parseInt(loseMatch[1], 10) : 0
    const cGames = playMatch ? Number.parseInt(playMatch[1], 10) : cWins + cLosses
    const cWinRate = rateMatch
      ? Number.parseInt(rateMatch[1], 10)
      : cWins + cLosses > 0
        ? Math.round((cWins / (cWins + cLosses)) * 100)
        : 0
    agents.push({
      name,
      iconUrl: valorantAgentIconUrl(name),
      wins: cWins,
      losses: cLosses,
      winRate: cWinRate,
      count: cGames,
    })
    if (agents.length >= 3) break
  }
  return agents
}

export function extractBalancedJsonSlice(text: string, prefix: string): string | null {
  const pIdx = text.indexOf(prefix)
  if (pIdx === -1) return null
  const start = text.indexOf('{', pIdx)
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') {
        escaped = !escaped
      } else if (c === '"' && !escaped) {
        inString = false
      } else {
        escaped = false
      }
    } else {
      if (c === '"') {
        inString = true
      } else if (c === '{') {
        depth++
      } else if (c === '}') {
        depth--
        if (depth === 0) {
          return text.slice(start, i + 1)
        }
      }
    }
  }
  return null
}

export function parseOpggValorantHtml(
  html: string,
  summonerName: string,
  tagLine: string,
  region: string,
): OpggStats | null {
  const unescaped = html.includes('\\"') ? html.replace(/\\"/g, '"') : html
  const jsonStr =
    extractBalancedJsonSlice(unescaped, '"profile":') || extractBalancedJsonSlice(html, '"profile":')
  if (!jsonStr) return null

  try {
    const data = JSON.parse(jsonStr) as {
      gameName?: string
      tagLine?: string
      level?: number
      region?: string
      competitiveTier?: number
      puuid?: string
      rank?: number
      tierProgress?: number
      score?: number
      rankedRating?: number
      rr?: number
      wins?: number
      losses?: number
      winRate?: number
      kd?: number
      headshotRate?: number
      headshotPercentage?: number
      damagePerRound?: number
      mostCharacterId?: string
    }

    const tierNum = typeof data.competitiveTier === 'number' ? data.competitiveTier : 0
    const formattedRank = valorantTierToRank(tierNum)
    const spaceIdx = formattedRank.indexOf(' ')
    const tier = spaceIdx !== -1 ? formattedRank.slice(0, spaceIdx) : formattedRank
    const rank = spaceIdx !== -1 ? formattedRank.slice(spaceIdx + 1) : ''
    const finalName = data.gameName || summonerName
    const finalTag = data.tagLine || tagLine
    const url = `https://op.gg/valorant/profile/${encodeURIComponent(finalName)}-${encodeURIComponent(finalTag)}`

    const cardMatch =
      html.match(/https:\/\/c-valorant-api\.op\.gg\/Assets\/PlayerCards\/[a-zA-Z0-9_\-]+(?:_small)?\.png/i) ||
      html.match(/https?:\/\/[^"'\s\\]*(?:playercards|player-cards|PlayerCards)[^"'\s\\]*\.(?:png|webp|jpg)/i)
    const avatarUrl = cardMatch ? cardMatch[0] : undefined

    const rr =
      typeof data.rank === 'number' && data.rank <= 100
        ? data.rank
        : typeof data.tierProgress === 'number'
          ? data.tierProgress
          : typeof data.score === 'number'
            ? data.score
            : typeof data.rankedRating === 'number'
              ? data.rankedRating
              : typeof data.rr === 'number'
                ? data.rr
                : undefined

    const wins = typeof data.wins === 'number' ? data.wins : 0
    const losses = typeof data.losses === 'number' ? data.losses : 0
    const winRate =
      typeof data.winRate === 'number'
        ? data.winRate
        : wins + losses > 0
          ? Math.round((wins / (wins + losses)) * 100)
          : 0

    const kd = typeof data.kd === 'number' ? data.kd : undefined
    const headshotRate =
      typeof data.headshotRate === 'number'
        ? data.headshotRate
        : typeof data.headshotPercentage === 'number'
          ? data.headshotPercentage
          : undefined
    const damagePerRound = typeof data.damagePerRound === 'number' ? data.damagePerRound : undefined
    const combatStats =
      kd !== undefined || headshotRate !== undefined || damagePerRound !== undefined
        ? { kd, headshotRate, damagePerRound, winRate: winRate > 0 ? winRate : undefined }
        : undefined

    const topChampions = extractValorantAgents(html)
    if (topChampions.length === 0 && data.mostCharacterId) {
      const fallbackAgent = valorantAgentFromId(data.mostCharacterId)
      if (fallbackAgent) {
        topChampions.push({
          name: fallbackAgent,
          iconUrl: valorantAgentIconUrl(fallbackAgent),
          wins: 0,
          losses: 0,
          winRate: 0,
          count: 0,
        })
      }
    }

    return {
      summonerName: finalName,
      tagLine: finalTag,
      region: data.region || region,
      tier,
      rank,
      leaguePoints: 0,
      wins,
      losses,
      winRate,
      formattedRank,
      formattedWinRate: wins + losses === 0 ? 'Unranked (0 games)' : `${wins}W - ${losses}L (${winRate}%)`,
      opggUrl: url,
      fetchedAt: Math.floor(Date.now() / 1000),
      game: 'valorant',
      level: data.level,
      puuid: data.puuid,
      avatarUrl,
      rr,
      topChampions: topChampions.length > 0 ? topChampions : undefined,
      combatStats,
    }
  } catch {
    return null
  }
}
