export type SessionRow = {
  id: string
  account: string
  region: string
  user: string
  initials: string
  device: string
  status: 'active' | 'ended' | 'stale' | 'error'
  started: string
  avatarTone: 'violet' | 'cyan' | 'amber' | 'rose'
}

export type ActivityItem = {
  id: string
  title: string
  detail: string
  time: string
  tone: 'success' | 'info' | 'warning' | 'neutral'
}

export type AccountRow = {
  id: string
  name: string
  region: string
  status: 'Available' | 'Leased' | 'Maintenance' | 'Disabled'
  lastUsed: string
  level: number
  accent: 'violet' | 'cyan' | 'lime' | 'orange' | 'rose'
}
