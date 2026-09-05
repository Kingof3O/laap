import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiRequest, hasTauri, invokeTauri } from '../../lib/api'
import { useDevice } from '../device'
import type { Account, User } from '../../lib/types'

export type LeaseUiState =
  | 'IDLE'
  | 'LEASE_ACQUIRED'
  | 'RIOT_CLIENT_STARTING'
  | 'WAITING_FOR_RIOT_LOGIN'
  | 'LEAGUE_RUNNING'
  | 'LEASE_LOST'
  | 'RIOT_CLIENT_CLOSED'

const ACTIVE_LEASE_KEY = 'laap_active_lease_v1'
const HEARTBEAT_INTERVAL_MS = 20_000

type RuntimeSnapshot = { riot_client: boolean; league_client: boolean; league_game: boolean }
type PersistedLease = { userId: string; deviceId: string; sessionId: string; accountId: string }

function clearPersistedLease() {
  try { localStorage.removeItem(ACTIVE_LEASE_KEY) } catch {}
}

export function useCloudAccounts(user: User | null) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [provisioning, setProvisioning] = useState(false)
  const [leaseState, setLeaseState] = useState<LeaseUiState>('IDLE')
  const [runtimeState, setRuntimeState] = useState<RuntimeSnapshot | null>(null)
  const missedHeartbeats = useRef(0)

  const { deviceId, error: deviceError } = useDevice(user)

  const loadAccounts = useCallback(async () => {
    if (!user) {
      setAccounts([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await apiRequest<{ accounts: Account[] }>('/api/accounts')
      setAccounts(result.accounts)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) void loadAccounts()
  }, [user, loadAccounts])

  useEffect(() => {
    const handleRefresh = () => { if (user) void loadAccounts() }
    window.addEventListener('laap:refresh', handleRefresh)
    return () => window.removeEventListener('laap:refresh', handleRefresh)
  }, [loadAccounts, user])

  const clearLocalLease = useCallback(async () => {
    setSessionId(null)
    setActiveAccountId(null)
    setLeaseState('IDLE')
    setRuntimeState(null)
    clearPersistedLease()
    if (hasTauri) await invokeTauri('cleanup_account_session').catch(() => {})
    await loadAccounts()
  }, [loadAccounts])

  const releaseLease = useCallback(async (reason: 'manual' | 'logout' | 'process_exit' | 'lease_timeout' | 'error' = 'manual') => {
    const currentSessionId = sessionId
    if (!currentSessionId) return
    setError(null)
    try {
      await apiRequest(`/api/leases/${currentSessionId}/release`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
    } finally {
      await clearLocalLease()
    }
  }, [clearLocalLease, sessionId])

  useEffect(() => {
    if (!user && sessionId) void releaseLease('logout')
  }, [releaseLease, sessionId, user])

  useEffect(() => {
    const handleLogout = () => { if (sessionId) void releaseLease('logout') }
    window.addEventListener('laap:logout', handleLogout)
    return () => window.removeEventListener('laap:logout', handleLogout)
  }, [releaseLease, sessionId])

  const persistLease = (nextSessionId: string, accountId: string) => {
    setSessionId(nextSessionId)
    setActiveAccountId(accountId)
    if (!user || !deviceId) return
    try { localStorage.setItem(ACTIVE_LEASE_KEY, JSON.stringify({ userId: user.id, deviceId, sessionId: nextSessionId, accountId } satisfies PersistedLease)) } catch {}
  }

  const acquireAndLaunch = async (accId: string, onStepChange?: (step: string) => void) => {
    if (!deviceId || !hasTauri) throw new Error(deviceError || 'Device is initializing. Please wait a moment.')
    setError(null)
    let acquiredSessionId: string | null = null
    try {
      onStepChange?.('Securing account lease…')
      const nonce = `${Date.now()}:${accId}`
      const signature = await invokeTauri<string>('sign_device_nonce', { nonce })
      const result = await apiRequest<{ sessionId: string }>('/api/leases/acquire', {
        method: 'POST',
        body: JSON.stringify({ accountId: accId, deviceId, nonce, signature }),
      })
      acquiredSessionId = result.sessionId
      persistLease(result.sessionId, accId)
      setLeaseState('LEASE_ACQUIRED')

      onStepChange?.('Preparing Riot Client…')
      const sessionRes = await apiRequest<{ sessionBlob: string }>(`/api/leases/${result.sessionId}/session-blob`)
      await invokeTauri('inject_account_session', { sessionYaml: sessionRes.sessionBlob })

      onStepChange?.('Launching League of Legends…')
      setLeaseState('RIOT_CLIENT_STARTING')
      await invokeTauri('launch_riot_client')
      await loadAccounts()
    } catch (cause) {
      if (acquiredSessionId) {
        await apiRequest(`/api/leases/${acquiredSessionId}/release`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'error' }),
        }).catch(() => {})
      }
      await clearLocalLease()
      throw cause
    }
  }

  // Restore a lease after a normal app restart and verify it with a heartbeat.
  useEffect(() => {
    if (!user || !deviceId || sessionId) return
    try {
      const stored = JSON.parse(localStorage.getItem(ACTIVE_LEASE_KEY) ?? 'null') as PersistedLease | null
      if (!stored || stored.userId !== user.id || stored.deviceId !== deviceId) return
      setSessionId(stored.sessionId)
      setActiveAccountId(stored.accountId)
      setLeaseState('LEASE_ACQUIRED')
      void apiRequest(`/api/leases/${stored.sessionId}/heartbeat`, { method: 'POST', body: JSON.stringify({ runtimeState: 'IN_CLIENT' }) }).catch(() => { void clearLocalLease() })
    } catch { clearPersistedLease() }
  }, [clearLocalLease, deviceId, sessionId, user])

  // Keep the server lease alive and release it when both Riot and League exit.
  useEffect(() => {
    if (!sessionId || !hasTauri) return
    let disposed = false
    let closedChecks = 0
    let launchChecks = 0
    let runtimeStarted = false
    missedHeartbeats.current = 0
    const tick = async () => {
      if (disposed) return
      try {
        const runtime = await invokeTauri<RuntimeSnapshot>('runtime_snapshot')
        setRuntimeState(runtime)
        const runtimeState = runtime.league_game ? 'IN_GAME' : runtime.league_client || runtime.riot_client ? 'IN_CLIENT' : 'EXITED'
        setLeaseState(runtime.league_game ? 'LEAGUE_RUNNING' : runtime.league_client || runtime.riot_client ? 'WAITING_FOR_RIOT_LOGIN' : 'RIOT_CLIENT_STARTING')
        if (runtimeState === 'EXITED') {
          if (!runtimeStarted) {
            launchChecks += 1
          } else {
            closedChecks += 1
          }
          // Allow a cold Riot Client launch up to two minutes. Once the
          // client has appeared, two consecutive closed checks end the lease.
          if ((!runtimeStarted && launchChecks >= 6) || (runtimeStarted && closedChecks >= 2)) {
            setLeaseState('RIOT_CLIENT_CLOSED')
            await releaseLease('process_exit')
            return
          }
        } else {
          runtimeStarted = true
          launchChecks = 0
          closedChecks = 0
        }
        await apiRequest(`/api/leases/${sessionId}/heartbeat`, { method: 'POST', body: JSON.stringify({ runtimeState }) })
        missedHeartbeats.current = 0
      } catch (cause) {
        missedHeartbeats.current += 1
        const message = cause instanceof Error ? cause.message : String(cause)
        if ((cause instanceof ApiError && ['SESSION_NOT_FOUND', 'ASSIGNMENT_EXPIRED', 'DEVICE_NOT_AUTHORIZED', 'UNAUTHENTICATED'].includes(cause.code)) || /SESSION_NOT_FOUND|ASSIGNMENT_EXPIRED|DEVICE_NOT_AUTHORIZED|UNAUTHENTICATED/i.test(message)) {
          setLeaseState('LEASE_LOST')
          setError(message)
          await clearLocalLease()
          return
        }
        // Allow short network interruptions. The server reaper remains the
        // authority and will mark the lease stale if heartbeats truly stop.
        if (missedHeartbeats.current >= 7) {
          setLeaseState('LEASE_LOST')
          setError(message)
          await clearLocalLease()
        }
      }
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, HEARTBEAT_INTERVAL_MS)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [clearLocalLease, releaseLease, sessionId])

  // Give the desktop app a chance to release its lease before the native
  // window closes. Crash recovery is still handled by the server reaper.
  useEffect(() => {
    if (!sessionId || !hasTauri) return
    let unlisten: (() => void) | undefined
    let closing = false
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow()
      unlisten = await appWindow.onCloseRequested(async (event) => {
        if (closing) return
        event.preventDefault()
        closing = true
        await releaseLease('logout').catch(() => {})
        await appWindow.destroy()
      })
    }).catch(() => {})
    return () => { unlisten?.() }
  }, [releaseLease, sessionId])

  const deleteCloudAccount = async (id: string) => { setError(null); await apiRequest(`/api/accounts/${id}`, { method: 'DELETE' }); await loadAccounts() }
  const uploadSessionBlob = async (accountId: string, sessionBlob: string) => { setError(null); await apiRequest(`/api/accounts/${accountId}/session-blob`, { method: 'PUT', body: JSON.stringify({ sessionBlob }) }) }
  const forceReleaseCloudAccount = async (id: string) => { setError(null); await apiRequest(`/api/accounts/${id}/release`, { method: 'POST' }); await loadAccounts() }
  const revokeCloudSessionBlob = async (id: string) => { setError(null); await apiRequest(`/api/accounts/${id}/session-blob`, { method: 'DELETE' }); await loadAccounts() }
  const startSandbox = async () => { if (!hasTauri) return; setError(null); setProvisioning(true); try { await invokeTauri('start_provisioning_session') } catch (cause) { setProvisioning(false); throw cause } }
  const pollSandbox = async (): Promise<string | null> => hasTauri ? invokeTauri<string | null>('poll_provisioning_session') : null
  const finishSandbox = async () => { if (!hasTauri) return; try { await invokeTauri('finish_provisioning_session') } finally { setProvisioning(false) } }
  const cancelSandbox = async () => { if (!hasTauri) return; try { await invokeTauri('cancel_provisioning_session') } finally { setProvisioning(false) } }

  return { accounts, loading, error: error || deviceError, sessionId, activeAccountId, leaseState, runtimeState, provisioning, deviceId, loadAccounts, acquireAndLaunch, releaseLease, deleteCloudAccount, uploadSessionBlob, forceReleaseCloudAccount, revokeCloudSessionBlob, startSandbox, pollSandbox, finishSandbox, cancelSandbox }
}
