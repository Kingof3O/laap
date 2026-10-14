export type AppMode = 'local' | 'cloud'
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

export interface User {
  id: string
  email: string
  displayName: string
  role: 'admin' | 'operator'
  status: string
}

export interface Account {
  id: string
  name: string
  region: string
  status: string
  lastUsed: string
  level: number
  accent: string
  hasSessionBlob?: boolean
}

export interface LocalAccountSummary {
  rank?: string | null
  id: string
  name: string
  region: string
  notes: string
  favorite: boolean
  customization?: ProfileCustomization
  session_status: 'missing' | 'stale' | 'saved' | 'unknown'
  has_session: boolean
  created_at: string
  last_used_at: string | null
}

export interface LocalAccountFull {
  rank?: string | null
  id: string
  name: string
  region: string
  notes: string
  favorite: boolean
  customization?: ProfileCustomization
  puuid?: string | null
  session_blob: string
  created_at: string
  last_used_at: string | null
}

export interface ProfileCustomization {
  icon_asset: string | null
  icon_source: 'upload' | 'riot' | 'game' | null
  icon_id: number | null
  auto_sync_icon: boolean
  auto_sync_rank: boolean
}
export interface ProfileDetails {
  name: string
  region: string
  rank: string | null
  notes: string
  favorite: boolean
  customization?: ProfileCustomization
}
export interface CapturedProfile {
  session_blob: string
  details: { name: string | null; region: string | null; puuid: string | null }
}
