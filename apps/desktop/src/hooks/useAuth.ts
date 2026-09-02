import { useCallback, useEffect, useState } from 'react'
import { apiRequest, getStoredToken, getStoredUser, saveStoredAuth, setRuntimeToken } from '../lib/api'
import type { User } from '../lib/types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(getStoredUser)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkSession = useCallback(async () => {
    const token = getStoredToken()
    if (!token) {
      setUser(null)
      return
    }
    setRuntimeToken(token)
    try {
      const result = await apiRequest<{ user: User | null }>('/api/auth/session')
      if (result.user) {
        setUser(result.user)
        saveStoredAuth(token, result.user)
      } else {
        setUser(null)
        setRuntimeToken(null)
        saveStoredAuth(null, null)
      }
    } catch {
      setUser(null)
      setRuntimeToken(null)
      saveStoredAuth(null, null)
    }
  }, [])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  const login = async (email: string, password: string, rememberMe = true) => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiRequest<{ user: User; accessToken?: string }>('/api/auth/login?client=tauri', {
        method: 'POST',
        headers: { 'x-laap-client': 'tauri' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const token = result.accessToken ?? null
      setRuntimeToken(token)
      setUser(result.user)
      if (rememberMe && token) {
        saveStoredAuth(token, result.user)
      } else {
        saveStoredAuth(null, null)
      }
      return result.user
    } catch (cause) {
      setRuntimeToken(null)
      saveStoredAuth(null, null)
      const msg = cause instanceof Error ? cause.message : String(cause)
      const friendly = msg.includes('INVALID_LOGIN') ? 'Incorrect email or password.' : msg
      setError(friendly)
      throw new Error(friendly)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    } finally {
      setRuntimeToken(null)
      saveStoredAuth(null, null)
      setUser(null)
    }
  }

  return {
    user,
    loading,
    error,
    setError,
    login,
    logout,
    checkSession,
  }
}
