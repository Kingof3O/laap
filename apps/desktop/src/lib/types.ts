export type ViewMode = 'grid' | 'list'
export type Region =
  | 'ALL'
  | 'EUW'
  | 'NA'
  | 'KR'
  | 'BR'
  | 'EUNE'
  | 'LAN'
  | 'LAS'
  | 'OCE'
  | 'TR'
  | 'RU'
  | 'JP'
  | 'SEA'
  | 'SG'
  | 'TW'
  | 'VN'
  | 'PH'
  | 'TH'
  | 'ME'

export type Game = 'league' | 'valorant'

export interface LocalAccountSummary {
  rank?: string | null
  id: string
  name: string
  region: string
  riot_id?: string | null
  notes: string
  favorite: boolean
  customization?: ProfileCustomization
  session_status: 'missing' | 'stale' | 'saved' | 'unknown'
  has_session: boolean
  has_puuid?: boolean
  created_at: string
  last_used_at: string | null
  games: Game[]
  valorant_rank?: string | null
  last_game?: Game | null
}

export interface LocalAccountFull {
  rank?: string | null
  id: string
  name: string
  region: string
  riot_id?: string | null
  notes: string
  favorite: boolean
  customization?: ProfileCustomization
  puuid?: string | null
  session_blob: string
  created_at: string
  last_used_at: string | null
  games: Game[]
  valorant_rank?: string | null
  last_game?: Game | null
}

export interface ProfileCustomization {
  icon_asset: string | null
  icon_source: 'upload' | 'riot' | 'game' | null
  icon_id: number | null
  auto_sync_icon: boolean
  auto_sync_rank: boolean
  auto_sync_valorant_rank?: boolean
  valorant_icon_asset?: string | null
}
export interface ProfileDetails {
  name: string
  region: string
  rank: string | null
  riot_id?: string | null
  notes: string
  favorite: boolean
  customization?: ProfileCustomization
  games?: Game[]
  valorant_rank?: string | null
}
export interface CapturedProfile {
  session_blob: string
  details: { name: string | null; region: string | null; puuid: string | null }
}

export type LiveStatusMode = 'off' | 'direct' | 'worker'

export interface LiveStatusSettings {
  mode: LiveStatusMode
  workerUrl: string
  prelaunchGuard: boolean
  hasRiotApiKey: boolean
  hasWorkerToken: boolean
  envRiotKeyPresent: boolean
  builtInWorkerConfigured?: boolean
}

export interface LiveMatchStatus {
  configured: boolean
  mode: LiveStatusMode
  inGame: boolean
  cached: boolean
  puuid: string | null
  platform: string
  checkedAt: string
  gameId: number | null
  gameMode: string | null
  gameType: string | null
  queueId: number | null
  gameLengthSeconds: number | null
  championId: number | null
}

export interface LiveStatusBadge {
  checking?: boolean
  inGame?: boolean
  gameMode?: string | null
  gameLengthSeconds?: number | null
  checkedAt?: string | null
}
