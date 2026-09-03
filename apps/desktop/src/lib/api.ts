import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from './constants'
import type { User } from './types'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '') || 'https://laap-api.hussiensalah100.workers.dev'

export async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = await import('@tauri-apps/api/core')
  return tauri.invoke<T>(command, args)
}

export const hasTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function openExternalUrl(url: string): Promise<void> {
  if (hasTauri) {
    try {
      await invokeTauri('open_external_url', { url })
      return
    } catch {
      // Fallback to window.open
    }
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function getStoredToken(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  } catch {
    return null
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(AUTH_USER_KEY) : null
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveStoredAuth(token: string | null, user: User | null) {
  try {
    if (typeof window === 'undefined') return
    if (token && user) {
      localStorage.setItem(AUTH_TOKEN_KEY, token)
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      localStorage.removeItem(AUTH_USER_KEY)
    }
  } catch {}
}

let activeToken: string | null = getStoredToken()

export function setRuntimeToken(token: string | null) {
  activeToken = token
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestHeaders = new Headers(init.headers)
  requestHeaders.set('content-type', 'application/json')
  if (activeToken) {
    requestHeaders.set('authorization', `Bearer ${activeToken}`)
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: requestHeaders,
  })
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(body.error?.message ?? `Request failed (${response.status})`)
  }
  return body as T
}
