import type { ApiUser, DashboardSnapshot } from '@laap/types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

type SessionResponse = { user: ApiUser | null; accessToken?: string }
export type AuditEntry = { id: string; action: string; entityType: string; entityId: string; payload: Record<string, unknown>; createdAt: string; actor: string }
export type AuditPage = { audit: AuditEntry[]; pagination: { limit: number; offset: number; hasMore: boolean } }

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  
  // Attach persistent access token from localStorage or sessionStorage
  const token = localStorage.getItem('laap_access_token') || sessionStorage.getItem('laap_access_token')
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12_000)
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api${path}`, { ...init, headers, credentials: 'include', signal: init.signal ?? controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError(408, 'REQUEST_TIMEOUT', 'The API took too long to respond')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } }
  if (!response.ok) throw new ApiError(response.status, payload.error?.code ?? 'REQUEST_FAILED', payload.error?.message ?? 'Request failed')
  return payload as T
}

export const api = {
  getSession: () => request<SessionResponse>('/auth/session'),
  demoLogin: async () => {
    const res = await request<SessionResponse>('/auth/demo', { method: 'POST' })
    if (res.accessToken) localStorage.setItem('laap_access_token', res.accessToken)
    return res
  },
  login: async (email: string, password: string, remember = true) => {
    const res = await request<SessionResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    if (res.accessToken) {
      if (remember) {
        localStorage.setItem('laap_access_token', res.accessToken)
        sessionStorage.removeItem('laap_access_token')
      } else {
        sessionStorage.setItem('laap_access_token', res.accessToken)
        localStorage.removeItem('laap_access_token')
      }
    }
    return res
  },
  logout: async () => {
    try {
      await request<{ success: true }>('/auth/logout', { method: 'POST' })
    } finally {
      localStorage.removeItem('laap_access_token')
      sessionStorage.removeItem('laap_access_token')
    }
    return { success: true as const }
  },
  getDashboard: () => request<DashboardSnapshot>('/dashboard'),
  releaseLease: (sessionId: string, reason = 'admin_force_release') => request<{ success: true }>(`/leases/${sessionId}/release`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getAccounts: () => request<{ accounts: DashboardSnapshot['accounts'] }>('/accounts'),
  createAccount: (input: { displayName: string; externalId: string; region: string; status: 'available' | 'maintenance' | 'disabled' }) => request<{ accountId: string }>('/accounts', { method: 'POST', body: JSON.stringify(input) }),
  deleteAccount: (accountId: string) => request<{ success: true }>(`/accounts/${accountId}`, { method: 'DELETE' }),
  deleteSessionBlob: (accountId: string) => request<{ success: true }>(`/accounts/${accountId}/session-blob`, { method: 'DELETE' }),
  forceReleaseAccount: (accountId: string) => request<{ success: true }>(`/accounts/${accountId}/release`, { method: 'POST' }),
  getAssignments: () => request<{ assignments: Array<{ id: string; accountId: string; userId: string; account: string; user: string; email: string; status: string; assignedAt: string; expiresAt: string | null }> }>('/assignments'),
  addAssignment: (input: { accountId: string; userId: string; expiresAt?: string | null }) => request<{ assignmentId: string }>('/assignments', { method: 'POST', body: JSON.stringify(input) }),
  revokeAssignment: (accountId: string, userId: string) => request<{ success: true }>(`/assignments/${accountId}/${userId}`, { method: 'DELETE' }),
  getUsers: () => request<{ users: ApiUser[] }>('/users'),
  createUser: (input: { email: string; displayName: string; password: string; role: 'admin' | 'operator' }) => request<{ user: ApiUser }>('/users', { method: 'POST', body: JSON.stringify(input) }),
  getDevices: () => request<{ devices: Array<{ id: string; userId: string; deviceName: string; platform: string; appVersion: string; status: string; lastSeenAt: string; user: string; publicKeyPresent: boolean }> }>('/devices'),
  revokeDevice: (deviceId: string) => request<{ success: true }>(`/devices/${deviceId}`, { method: 'DELETE' }),
  getAudit: ({ limit = 10, offset = 0 }: { limit?: number; offset?: number } = {}) => request<AuditPage>(`/audit?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`),
}
