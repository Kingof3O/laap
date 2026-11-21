import type { Game } from '../types.ts'

export interface ChampionStat {
  name: string
  iconUrl: string
  wins?: number
  losses?: number
  winRate?: number
  count?: number
  kda?: string | number
}

export interface CombatStats {
  kd?: number
  headshotRate?: number
  damagePerRound?: number
  winRate?: number
}

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
  rr?: number
  topChampions?: ChampionStat[]
  combatStats?: CombatStats
}

export interface LocalStatsCacheEntry {
  stats: OpggStats
  savedAt: number
  isStale: boolean
}
