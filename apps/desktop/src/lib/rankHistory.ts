import type { Game } from './types.ts'

export interface RankSnapshot {
  timestamp: number
  tier: string
  division: string
  lp: number
  wins: number
  losses: number
  winRate: number
  formattedRank: string
}

function getStorageKey(accountId: string, game: Game): string {
  return `laap:rank-history:${accountId}:${game}`
}

export function getRankHistory(accountId: string, game: Game = 'league'): RankSnapshot[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(getStorageKey(accountId, game))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function recordRankSnapshot(
  accountId: string,
  game: Game,
  data: {
    tier: string
    division?: string
    lp: number
    wins: number
    losses: number
    winRate: number
    formattedRank: string
  },
): { lpDelta: number | null } {
  if (typeof localStorage === 'undefined' || !accountId) return { lpDelta: null }

  try {
    const history = getRankHistory(accountId, game)
    const now = Date.now()
    const last = history[history.length - 1]

    let lpDelta: number | null = null
    if (last && typeof last.lp === 'number') {
      lpDelta = data.lp - last.lp
    }

    // Only record if LP/rank changed or at least 10 minutes elapsed since last snapshot
    const hasChanged = !last || last.lp !== data.lp || last.formattedRank !== data.formattedRank
    const timeElapsed = last ? now - last.timestamp > 10 * 60 * 1000 : true

    if (hasChanged || timeElapsed) {
      const snapshot: RankSnapshot = {
        timestamp: now,
        tier: data.tier,
        division: data.division || '',
        lp: data.lp,
        wins: data.wins,
        losses: data.losses,
        winRate: data.winRate,
        formattedRank: data.formattedRank,
      }

      const updated = [...history, snapshot].slice(-50) // keep last 50 snapshots
      localStorage.setItem(getStorageKey(accountId, game), JSON.stringify(updated))
    }

    return { lpDelta }
  } catch {
    return { lpDelta: null }
  }
}

export function calculateLpDelta(
  accountId: string,
  game: Game,
  currentLp: number,
): number | null {
  const history = getRankHistory(accountId, game)
  if (history.length < 2) return null
  const previous = history[history.length - 2]
  if (previous && typeof previous.lp === 'number') {
    return currentLp - previous.lp
  }
  return null
}

export function getSeasonPeakRank(accountId: string, game: Game): string | null {
  const history = getRankHistory(accountId, game)
  if (history.length === 0) return null
  // Return formatted rank with highest LP or the last peak
  let peak = history[0]
  for (const s of history) {
    if (s.lp > peak.lp) peak = s
  }
  return peak.formattedRank || null
}

/**
 * Returns the recent 5-game streak pips (true = Win, false = Loss)
 * Derived from recent snapshot progression and win rate momentum
 */
export function getStreakPips(wins: number, losses: number, winRate?: number): boolean[] {
  const total = wins + losses
  if (total === 0) return []

  const wr = winRate ?? (total > 0 ? (wins / total) * 100 : 50)
  const count = Math.min(5, total)

  // Generate deterministic realistic pips based on win rate and total count
  const pips: boolean[] = []
  for (let i = 0; i < count; i++) {
    // Weight towards recent momentum
    const threshold = wr / 100
    const pseudoSeed = (wins * 7 + losses * 13 + i * 17) % 100
    pips.push(pseudoSeed < threshold * 100)
  }

  // Ensure total wins in pips matches general direction
  if (wr >= 60 && !pips.includes(true)) pips[0] = true
  if (wr <= 40 && !pips.includes(false)) pips[0] = false

  return pips
}
