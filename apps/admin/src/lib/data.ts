import type { SessionState } from '@laap/types'

export type SessionRow = {
  id: string
  account: string
  region: string
  user: string
  initials: string
  device: string
  runtimeState: SessionState
  status: 'active' | 'starting' | 'stopping' | 'stale' | 'error'
  started: string
  heartbeat: string
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
  status: 'Available' | 'Leased' | 'Maintenance'
  lastUsed: string
  level: number
  accent: 'violet' | 'cyan' | 'lime' | 'orange' | 'rose'
}

export const sessions: SessionRow[] = [
  {
    id: 'ses_7f2a',
    account: 'Nova#EUW',
    region: 'EUW',
    user: 'Maya Chen',
    initials: 'MC',
    device: 'MacBook Pro · macOS',
    runtimeState: 'IN_GAME',
    status: 'active',
    started: '18 min ago',
    heartbeat: '12 sec ago',
    avatarTone: 'violet',
  },
  {
    id: 'ses_3d91',
    account: 'Atlas#NA1',
    region: 'NA',
    user: 'Jon Bell',
    initials: 'JB',
    device: 'Studio PC · Windows',
    runtimeState: 'IN_CLIENT',
    status: 'active',
    started: '42 min ago',
    heartbeat: '8 sec ago',
    avatarTone: 'cyan',
  },
  {
    id: 'ses_8bc4',
    account: 'Morrow#KR1',
    region: 'KR',
    user: 'Sora Park',
    initials: 'SP',
    device: 'Mac mini · macOS',
    runtimeState: 'RECONNECTING',
    status: 'active',
    started: '1h 06m ago',
    heartbeat: '31 sec ago',
    avatarTone: 'amber',
  },
  {
    id: 'ses_229e',
    account: 'Orbit#BR1',
    region: 'BR',
    user: 'Leo Martins',
    initials: 'LM',
    device: 'Gaming rig · Windows',
    runtimeState: 'LAUNCHING',
    status: 'starting',
    started: '2 min ago',
    heartbeat: '4 sec ago',
    avatarTone: 'rose',
  },
]

export const activity: ActivityItem[] = [
  {
    id: 'act_01',
    title: 'Lease acquired',
    detail: 'Nova#EUW · Maya Chen',
    time: '2 min ago',
    tone: 'success',
  },
  {
    id: 'act_02',
    title: 'Device registered',
    detail: 'MacBook Pro · macOS 15.6',
    time: '14 min ago',
    tone: 'info',
  },
  {
    id: 'act_03',
    title: 'Session reconnecting',
    detail: 'Morrow#KR1 · protected window',
    time: '27 min ago',
    tone: 'warning',
  },
  {
    id: 'act_04',
    title: 'Assignment updated',
    detail: 'Atlas#NA1 · added by you',
    time: '41 min ago',
    tone: 'neutral',
  },
]

export const accounts: AccountRow[] = [
  { id: 'acc_01', name: 'Nova#EUW', region: 'EU West', status: 'Leased', lastUsed: 'Now', level: 284, accent: 'violet' },
  { id: 'acc_02', name: 'Atlas#NA1', region: 'North America', status: 'Leased', lastUsed: 'Now', level: 193, accent: 'cyan' },
  { id: 'acc_03', name: 'Morrow#KR1', region: 'Korea', status: 'Leased', lastUsed: 'Now', level: 327, accent: 'orange' },
  { id: 'acc_04', name: 'Lumen#EUNE', region: 'EU Nordic & East', status: 'Available', lastUsed: 'Yesterday', level: 156, accent: 'lime' },
  { id: 'acc_05', name: 'Orbit#BR1', region: 'Brazil', status: 'Leased', lastUsed: '2 min ago', level: 208, accent: 'rose' },
]

export const chartSets = {
  '24h': {
    points: '0,113 45,108 90,116 135,88 180,96 225,69 270,77 315,44 360,59 405,31 450,39 495,21',
    area: 'M0 113 L45 108 L90 116 L135 88 L180 96 L225 69 L270 77 L315 44 L360 59 L405 31 L450 39 L495 21 L495 150 L0 150 Z',
    labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
    value: '186',
    delta: '+14.8%',
  },
  '7d': {
    points: '0,124 45,98 90,112 135,75 180,86 225,57 270,82 315,50 360,64 405,34 450,45 495,26',
    area: 'M0 124 L45 98 L90 112 L135 75 L180 86 L225 57 L270 82 L315 50 L360 64 L405 34 L450 45 L495 26 L495 150 L0 150 Z',
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    value: '1,204',
    delta: '+9.2%',
  },
  '30d': {
    points: '0,130 45,115 90,122 135,104 180,109 225,85 270,93 315,65 360,73 405,52 450,60 495,37',
    area: 'M0 130 L45 115 L90 122 L135 104 L180 109 L225 85 L270 93 L315 65 L360 73 L405 52 L450 60 L495 37 L495 150 L0 150 Z',
    labels: ['Aug 01', 'Aug 06', 'Aug 11', 'Aug 16', 'Aug 21', 'Aug 26'],
    value: '5,843',
    delta: '+18.4%',
  },
} as const

export type ChartRange = keyof typeof chartSets

export const pageMeta = {
  Overview: {
    eyebrow: 'OPERATIONS / OVERVIEW',
    title: 'Operational clarity, at a glance.',
    description: 'Monitor leases, devices, and runtime health across your account pool.',
  },
  'Account pool': {
    eyebrow: 'OPERATIONS / ACCOUNT POOL',
    title: 'Your account pool, in one place.',
    description: 'Review availability, regions, and health without exposing credentials.',
  },
  Assignments: {
    eyebrow: 'ACCESS / ASSIGNMENTS',
    title: 'Access with guardrails.',
    description: 'Control who can claim each account and when that authorization expires.',
  },
  Devices: {
    eyebrow: 'TRUST / DEVICES',
    title: 'Every device, cryptographically known.',
    description: 'Review bound keys, app versions, and last-seen signals before a launch.',
  },
  'Audit log': {
    eyebrow: 'TRUST / AUDIT LOG',
    title: 'A complete trail of change.',
    description: 'Trace leases, assignments, and security events with accountable timestamps.',
  },
} as const

export type PageName = keyof typeof pageMeta
