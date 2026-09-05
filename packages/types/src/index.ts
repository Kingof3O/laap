export const sessionStatuses = [
  'active',
  'ended',
  'stale',
  'error',
] as const

export type SessionStatus = (typeof sessionStatuses)[number]

export const sessionRuntimeStates = ['LAUNCHING', 'IN_CLIENT', 'IN_GAME', 'RECONNECTING', 'EXITED'] as const
export type SessionRuntimeState = (typeof sessionRuntimeStates)[number]

export type Platform = 'windows' | 'macos'

export interface Account {
  id: string
  displayName: string
  region: string
  provider: 'riot'
  status: 'available' | 'maintenance' | 'disabled'
  hasSessionBlob?: boolean
}

export interface AccountSession {
  id: string
  accountId: string
  userId: string
  deviceId: string
  status: SessionStatus
  runtimeState?: SessionRuntimeState
  startedAt: string
  endedAt?: string | null
  releaseReason?: string | null
}

export interface LaunchRequest {
  accountId: string
  deviceId: string
  nonce: string
  signature: string
}

export type UserRole = 'admin' | 'operator'

export interface ApiUser {
  id: string
  email: string
  displayName: string
  role: UserRole
  status: 'active' | 'suspended' | 'disabled'
}

export interface DashboardMetrics {
  availableAccounts: number
  totalAccounts: number
  activeLeases: number
  boundDevices: number
  healthyDevices: number
  authorizedUsers: number
  activeUsers: number
}

export interface DashboardSession {
  id: string
  account: string
  region: string
  user: string
  initials: string
  device: string
  status: SessionStatus
  started: string
  avatarTone: 'violet' | 'cyan' | 'amber' | 'rose'
}

export interface DashboardActivity {
  id: string
  title: string
  detail: string
  time: string
  tone: 'success' | 'info' | 'warning' | 'neutral'
}

export interface DashboardAccount {
  id: string
  name: string
  externalId?: string
  region: string
  status: 'Available' | 'Leased' | 'Maintenance' | 'Disabled'
  lastUsed: string
  level: number
  accent: 'violet' | 'cyan' | 'lime' | 'orange' | 'rose'
  hasSessionBlob?: boolean
  activeUser?: string
  activeDevice?: string
  sessionStarted?: string
}

export interface DashboardSnapshot {
  user: ApiUser
  metrics: DashboardMetrics
  sessions: DashboardSession[]
  activity: DashboardActivity[]
  accounts: DashboardAccount[]
}

export type { Database } from './database.js'
