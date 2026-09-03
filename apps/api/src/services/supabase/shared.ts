import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApiUser, DashboardAccount, DashboardSession, UserRole } from '@laap/types'
import { ServiceError } from '../service-error.js'

export type Row = Record<string, unknown>

export const activeStatuses = ['starting', 'active', 'stopping']
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

export function toneFor(id: string): DashboardSession['avatarTone'] {
  return avatarTones[id.charCodeAt(0) % avatarTones.length]
}

export function accentFor(id: string): DashboardAccount['accent'] {
  return accountAccents[id.charCodeAt(0) % accountAccents.length]
}

export function publicUser(row: Row): ApiUser {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    role: (row.role === 'admin' ? 'admin' : 'operator') as UserRole,
    status: (row.status as ApiUser['status']) ?? 'active',
  }
}

export async function executeQuery<T = Row[]>(
  builder: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  code = 'SUPABASE_ERROR'
): Promise<T> {
  const result = await builder
  if (result.error) throw new ServiceError(code, 503, result.error.message)
  return result.data as T
}
