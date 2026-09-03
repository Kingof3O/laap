import type { AccountRow, ActivityItem, SessionRow } from './types'

export const sessions: SessionRow[] = [
  {
    id: 'ses_7f2a',
    account: 'Nova#EUW',
    region: 'EUW',
    user: 'Maya Chen',
    initials: 'MC',
    device: 'MacBook Pro · macOS',
    status: 'active',
    started: '18 min ago',
    avatarTone: 'violet',
  },
  {
    id: 'ses_3d91',
    account: 'Atlas#NA1',
    region: 'NA',
    user: 'Jon Bell',
    initials: 'JB',
    device: 'Studio PC · Windows',
    status: 'active',
    started: '42 min ago',
    avatarTone: 'cyan',
  },
  {
    id: 'ses_8bc4',
    account: 'Morrow#KR1',
    region: 'KR',
    user: 'Sora Park',
    initials: 'SP',
    device: 'Mac mini · macOS',
    status: 'active',
    started: '1h 06m ago',
    avatarTone: 'amber',
  },
  {
    id: 'ses_229e',
    account: 'Orbit#BR1',
    region: 'BR',
    user: 'Leo Martins',
    initials: 'LM',
    device: 'Gaming rig · Windows',
    status: 'active',
    started: '2 min ago',
    avatarTone: 'rose',
  },
]

export const activity: ActivityItem[] = [
  {
    id: 'act_01',
    title: 'Session started',
    detail: 'Nova#EUW · Maya Chen',
    time: '2 min ago',
    tone: 'success',
  },
  {
    id: 'act_02',
    title: 'Computer added',
    detail: 'MacBook Pro · macOS 15.6',
    time: '14 min ago',
    tone: 'info',
  },
  {
    id: 'act_03',
    title: 'Session ended',
    detail: 'Morrow#KR1 · manual release',
    time: '27 min ago',
    tone: 'neutral',
  },
  {
    id: 'act_04',
    title: 'Access updated',
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
