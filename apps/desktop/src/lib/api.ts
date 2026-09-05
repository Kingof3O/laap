import { AUTH_TOKEN_KEY } from './constants'

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
      // Fall back to the browser opener if the native command is unavailable.
    }
  }
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer')
}

export async function loadStoredToken(): Promise<string | null> {
  if (hasTauri) {
    try { return await invokeTauri<string | null>('load_access_token') } catch { return null }
  }
  try { return typeof window !== 'undefined' ? sessionStorage.getItem(AUTH_TOKEN_KEY) : null } catch { return null }
}

export async function storeAuthToken(token: string | null, remember: boolean) {
  if (hasTauri) {
    if (token && remember) await invokeTauri('store_access_token', { token })
    else await invokeTauri('clear_access_token').catch(() => {})
    return
  }
  try {
    if (token && !remember) sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    else sessionStorage.removeItem(AUTH_TOKEN_KEY)
  } catch {}
}

export async function clearStoredToken() {
  if (hasTauri) {
    await invokeTauri('clear_access_token').catch(() => {})
    return
  }
  try { sessionStorage.removeItem(AUTH_TOKEN_KEY) } catch {}
}

let activeToken: string | null = null

export function setRuntimeToken(token: string | null) {
  activeToken = token
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestHeaders = new Headers(init.headers)
  if (!requestHeaders.has('content-type')) requestHeaders.set('content-type', 'application/json')
  if (activeToken) requestHeaders.set('authorization', `Bearer ${activeToken}`)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12_000)
  let removeAbortListener: (() => void) | undefined
  if (init.signal) {
    const abort = () => controller.abort()
    if (init.signal.aborted) controller.abort()
    else {
      init.signal.addEventListener('abort', abort, { once: true })
      removeAbortListener = () => init.signal?.removeEventListener('abort', abort)
    }
  }
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', headers: requestHeaders, signal: controller.signal })
    const body = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } }
    if (!response.ok) throw new ApiError(response.status, body.error?.code ?? 'REQUEST_FAILED', body.error?.message ?? `Request failed (${response.status})`)
    return body as T
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw new ApiError(408, 'REQUEST_TIMEOUT', 'The API took too long to respond')
    throw cause
  } finally {
    window.clearTimeout(timeout)
    removeAbortListener?.()
  }
}
