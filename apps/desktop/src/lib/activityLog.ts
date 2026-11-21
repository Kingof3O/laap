import type { Game } from './types.ts'

export interface ActivityEvent {
  id: string
  timestamp: number
  type: 'launch' | 'sync' | 'notes' | 'session_save' | 'switch'
  accountId: string
  accountName: string
  game: Game
  detail: string
}

const STORAGE_KEY = 'laap:activity-log'
const MAX_EVENTS = 100

export function getActivityLog(accountId?: string): ActivityEvent[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: ActivityEvent[] = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    if (accountId) {
      return parsed.filter((e) => e.accountId === accountId)
    }
    return parsed
  } catch {
    return []
  }
}

export function recordActivity(
  event: Omit<ActivityEvent, 'id' | 'timestamp'>,
): void {
  if (typeof localStorage === 'undefined') return
  try {
    const events = getActivityLog()
    const newEvent: ActivityEvent = {
      ...event,
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    }
    const updated = [newEvent, ...events].slice(0, MAX_EVENTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('laap:activity-updated', { detail: newEvent }))
  } catch {
    // Fail safe
  }
}

export function clearActivityLog(accountId?: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (accountId) {
      const remaining = getActivityLog().filter((e) => e.accountId !== accountId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    window.dispatchEvent(new CustomEvent('laap:activity-updated'))
  } catch {}
}
