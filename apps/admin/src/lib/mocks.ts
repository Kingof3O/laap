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

export const fallbackUsers = [
  { id: 'usr_01', email: 'maya.chen@laap.local', displayName: 'Maya Chen', role: 'operator', status: 'active' },
  { id: 'usr_02', email: 'jon.bell@laap.local', displayName: 'Jon Bell', role: 'operator', status: 'active' },
  { id: 'usr_03', email: 'sora.park@laap.local', displayName: 'Sora Park', role: 'operator', status: 'active' },
  { id: 'usr_04', email: 'leo.martins@laap.local', displayName: 'Leo Martins', role: 'operator', status: 'active' },
]

export const fallbackAssignments = [
  { id: 'asg_01', accountId: 'acc_01', userId: 'usr_01', account: 'Nova#EUW', user: 'Maya Chen', email: 'maya.chen@laap.local', status: 'active', assignedAt: new Date(Date.now() - 86400000 * 3).toISOString(), expiresAt: null },
  { id: 'asg_02', accountId: 'acc_02', userId: 'usr_02', account: 'Atlas#NA1', user: 'Jon Bell', email: 'jon.bell@laap.local', status: 'active', assignedAt: new Date(Date.now() - 86400000 * 5).toISOString(), expiresAt: null },
  { id: 'asg_03', accountId: 'acc_03', userId: 'usr_03', account: 'Morrow#KR1', user: 'Sora Park', email: 'sora.park@laap.local', status: 'active', assignedAt: new Date(Date.now() - 86400000 * 2).toISOString(), expiresAt: null },
  { id: 'asg_04', accountId: 'acc_05', userId: 'usr_04', account: 'Orbit#BR1', user: 'Leo Martins', email: 'leo.martins@laap.local', status: 'active', assignedAt: new Date(Date.now() - 86400000 * 7).toISOString(), expiresAt: null },
  { id: 'asg_05', accountId: 'acc_04', userId: 'usr_01', account: 'Lumen#EUNE', user: 'Maya Chen', email: 'maya.chen@laap.local', status: 'active', assignedAt: new Date(Date.now() - 86400000 * 1).toISOString(), expiresAt: null },
]
