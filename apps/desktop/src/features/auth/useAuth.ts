import { useCallback, useEffect, useState } from 'react'
import { apiRequest, clearStoredToken, loadStoredToken, setRuntimeToken, storeAuthToken } from '../../lib/api'
import type { User } from '../../lib/types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkSession = useCallback(async () => {
    const token = await loadStoredToken()
    if (!token) {
      setUser(null)
      return
    }
    setRuntimeToken(token)
    try {
      const result = await apiRequest<{ user: User | null }>('/api/auth/session')
      if (result.user) {
        setUser(result.user)
        // The token remains in memory; the OS keychain is used only when the
        // operator explicitly chooses to stay signed in.
      } else {
        setUser(null)
        setRuntimeToken(null)
        await clearStoredToken()
      }
    } catch {
      setUser(null)
      setRuntimeToken(null)
      await clearStoredToken()
    }
  }, [])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  const login = async (email: string, password: string, rememberMe = true) => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiRequest<{ user: User; accessToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password, remember: rememberMe }),
      })
      const token = result.accessToken ?? null
      if (!token) throw new Error('Desktop sign-in session could not be established. Please update LAAP and try again.')
      setRuntimeToken(token)
      setUser(result.user)
      if (rememberMe && token) {
        await storeAuthToken(token, true)
      } else {
        await storeAuthToken(null, false)
      }
      return result.user
    } catch (cause) {
      setRuntimeToken(null)
      await clearStoredToken()
      const msg = cause instanceof Error ? cause.message : String(cause)
      const friendly = msg.includes('INVALID_LOGIN') ? 'Incorrect email or password.' : msg
      setError(friendly)
      throw new Error(friendly)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('laap:logout'))
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    } finally {
      setRuntimeToken(null)
      await clearStoredToken()
      setUser(null)
      setError(null)
    }
  }

  return {
    user,
    loading,
    error,
    login,
    logout,
    checkSession,
  }
}
