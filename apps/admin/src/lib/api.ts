import type { AdminUser, AuditData, Customer, GiftCode, OverviewData } from './types'

const apiBaseUrl = (import.meta.env.VITE_BILLING_WORKER_URL ?? 'https://laap-billing-sandbox.hussiensalah100.workers.dev').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

function getStoredToken(): string | null {
  return localStorage.getItem('laap_owner_token')
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem('laap_owner_token', token)
  else localStorage.removeItem('laap_owner_token')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getStoredToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(408, 'REQUEST_TIMEOUT', 'The billing worker took too long to respond.')
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string | { code?: string; message?: string }
    [key: string]: unknown
  }

  if (!response.ok) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message ?? 'Request failed.'
    const code =
      typeof payload.error === 'object' && payload.error?.code
        ? payload.error.code
        : 'REQUEST_FAILED'
    throw new ApiError(response.status, code, message)
  }

  return payload as T
}

export const api = {
  sendOtp: (email: string) =>
    request<{ ok: true }>('/v1/auth/code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyOtp: async (email: string, code: string) => {
    const result = await request<{ accessToken: string }>('/v1/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    })
    setStoredToken(result.accessToken)
    return result
  },

  getSession: async () => {
    const token = getStoredToken()
    if (!token) return { user: null }
    try {
      const res = await request<{ user: AdminUser }>('/v1/owner/session', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return res
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setStoredToken(null)
      }
      throw err
    }
  },

  logout: async () => {
    setStoredToken(null)
    return { success: true }
  },

  getOverview: () =>
    request<OverviewData>('/v1/owner/overview', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getCustomers: () =>
    request<{ customers: Customer[] }>('/v1/owner/customers', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  grantPro: (input: { buyerId: string; email: string; duration: 'month' | 'year' | 'lifetime' }) =>
    request<{ ok: true; giftId: string; duration: string; code: string }>('/v1/owner/grant-pro', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  revokePro: (input: { buyerId: string; giftId?: string }) =>
    request<{ ok: true; message?: string }>('/v1/owner/revoke-pro', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  transferOverride: (input: { buyer: string; reason: string }) =>
    request<{ ok: true }>('/v1/owner/transfer-override', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getGifts: () =>
    request<GiftCode[]>('/v1/owner/gifts', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  createGift: (input: { duration: 'month' | 'year' | 'lifetime'; recipient?: string }) =>
    request<{ id: string; code: string; redeemBy: string }>('/v1/owner/create', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  revokeGift: (id: string) =>
    request<{ ok: true }>('/v1/owner/revoke', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  getAudit: () =>
    request<AuditData>('/v1/owner/audit', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
}
