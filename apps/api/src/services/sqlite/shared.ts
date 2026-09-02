import type { ApiUser, DashboardAccount, DashboardSession, UserRole } from '@laap/types'

export type UserRow = {
  id: string
  email: string
  password_hash: string
  display_name: string
  role: UserRole
  status: ApiUser['status']
}

export const avatarTones: DashboardSession['avatarTone'][] = ['violet', 'cyan', 'amber', 'rose']
export const accountAccents: DashboardAccount['accent'][] = ['violet', 'cyan', 'orange', 'lime', 'rose']

export function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds} sec ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m ago`
}

export function sessionTone(userId: string): DashboardSession['avatarTone'] {
  return avatarTones[userId.charCodeAt(0) % avatarTones.length]
}

export function accountTone(accountId: string): DashboardAccount['accent'] {
  return accountAccents[accountId.charCodeAt(0) % accountAccents.length]
}

export function publicUser(row: UserRow): ApiUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
  }
}
