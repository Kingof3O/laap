import type { ApiUser, DashboardAccount, DashboardSession } from '@laap/types'
import type { PageName } from './data'

/**
 * Keep the internal route names stable while presenting language that makes
 * sense to people who are not maintaining the system.
 */
export const pageLabels: Record<PageName, string> = {
  Overview: 'Home',
  'Account pool': 'Accounts',
  Assignments: 'Access',
  Users: 'People',
  Devices: 'Computers',
  'Audit log': 'History',
}

export function navigationLabel(page: PageName) {
  return pageLabels[page]
}

export type FriendlyAccountStatus = 'Ready' | 'In use' | 'Temporarily unavailable' | 'Disabled'

export function accountStatusLabel(status: DashboardAccount['status'] | string): FriendlyAccountStatus {
  if (status === 'Leased') return 'In use'
  if (status === 'Maintenance') return 'Temporarily unavailable'
  if (status === 'Disabled') return 'Disabled'
  return 'Ready'
}

export type FriendlySessionStatus = 'In use' | 'Ended' | 'Needs attention' | 'Problem'

export function sessionStatusLabel(status: DashboardSession['status'] | string): FriendlySessionStatus {
  if (status === 'stale') return 'Needs attention'
  if (status === 'error') return 'Problem'
  if (status === 'ended') return 'Ended'
  return 'In use'
}

export function assignmentStatusLabel(status: string) {
  return status === 'active' ? 'Active' : status === 'revoked' ? 'Removed' : 'Expired'
}

export function roleLabel(role: ApiUser['role']) {
  return role === 'admin' ? 'Administrator' : 'Operator'
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const actionLabels: Record<string, string> = {
  SESSION_STARTED: 'Session started',
  SESSION_ENDED: 'Session ended',
  SESSION_LAZILY_REAPED: 'Stale session cleaned up',
  DEVICE_REGISTERED: 'Computer added',
  DEVICE_REVOKED: 'Computer removed',
  ASSIGNMENT_UPDATED: 'Access updated',
  ASSIGNMENT_REVOKED: 'Access removed',
  ACCOUNT_CREATED: 'Account added',
  ACCOUNT_UPDATED: 'Account updated',
  ACCOUNT_DELETED: 'Account removed',
  USER_CREATED: 'Person added',
}

export function actionLabel(action: string) {
  return actionLabels[action] ?? action.replaceAll('_', ' ').toLowerCase().replace(/^./, (value) => value.toUpperCase())
}

export function activityTitle(title: string) {
  const labels: Record<string, string> = {
    'Lease acquired': 'Session started',
    'Lease released': 'Session ended',
    'Device registered': 'Computer added',
    'Assignment updated': 'Access updated',
    'Assignment revoked': 'Access removed',
    'Stale session reaped': 'Stale session cleaned up',
  }
  return labels[title] ?? title
}
