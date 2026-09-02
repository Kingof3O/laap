export type AppMode = 'local' | 'cloud'
export type ViewMode = 'grid' | 'list'
export type Region = 'ALL' | 'EUW' | 'NA' | 'KR' | 'BR' | 'EUNE' | 'LAN' | 'LAS' | 'OCE' | 'TR' | 'RU' | 'JP'

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
  id: string
  name: string
  region: string
  has_session: boolean
  created_at: string
  last_used_at: string | null
}

export interface LocalAccountFull {
  id: string
  name: string
  region: string
  session_blob: string
  created_at: string
  last_used_at: string | null
}
