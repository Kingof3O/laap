import { useNativeClose } from '../../shared/hooks/useNativeClose'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRiotOperations } from '../../context/RiotOperations'
import { ApiError, apiRequest, hasTauri, invokeTauri } from '../../lib/api'
import { useDevice } from '../device'
import type { Account, User } from '../../lib/types'

export type LeaseUiState = 'IDLE' | 'ACTIVE' | 'LEASE_LOST'

const ACTIVE_LEASE_KEY = 'laap_active_lease_v1'
const HEARTBEAT_INTERVAL_MS = 60_000

type PersistedLease = {
  userId: string
  deviceId?: string
  sessionId: string
  accountId: string
}

function clearPersistedLease() {
  try {
    localStorage.removeItem(ACTIVE_LEASE_KEY)
  } catch {}
}

export function useCloudAccounts(user: User | null) {
  const operations = useRiotOperations()
  const runRef = useRef(operations.run)
  runRef.current = operations.run
  const cloudMounted = useRef(true)
  const leaseOwner = useRef<string | null>(null)
  const sandboxTicket = useRef<string | null>(null)
  const sandboxGeneration = useRef(0)
  const loadGeneration = useRef(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [provisioning, setProvisioning] = useState(false)
  const [leaseState, setLeaseState] = useState<LeaseUiState>('IDLE')
  const missedHeartbeats = useRef(0)

  const { deviceId, error: deviceError } = useDevice(user)

  const loadAccounts = useCallback(async () => {
    const version = ++loadGeneration.current
    if (!user) {
      setAccounts([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await apiRequest<{ accounts: Account[] }>('/api/accounts')
      if (version === loadGeneration.current) setAccounts(result.accounts)
    } catch (cause) {
      if (version === loadGeneration.current) {
        setAccounts([])
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (version === loadGeneration.current) setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void loadAccounts()
    return () => {
      loadGeneration.current++
    }
  }, [user, loadAccounts])

  useEffect(() => {
    const handleRefresh = () => {
      if (user) void loadAccounts()
    }
    window.addEventListener('laap:refresh', handleRefresh)
    return () => window.removeEventListener('laap:refresh', handleRefresh)
  }, [loadAccounts, user])

  const clearLocalLease = useCallback(
    async (confirmed = false) => {
      const owner = leaseOwner.current
      leaseOwner.current = null
      setSessionId(null)
      setActiveAccountId(null)
      setLeaseState('IDLE')
      clearPersistedLease()
      let warning: string | null = null
      if (hasTauri && owner)
        try {
          await invokeTauri('cleanup_account_session', {
            confirmed,
            expectedOwner: `cloud:${owner}`,
          })
        } catch (cause) {
          warning = `Lease ended, but Riot settings could not be restored: ${String(cause)}`
        }
      await loadAccounts()
      if (warning) setError(warning)
    },
    [loadAccounts],
  )
  const releaseLease = useCallback(
    async (
      reason:
        | 'manual'
        | 'logout'
        | 'process_exit'
        | 'lease_timeout'
        | 'error' = 'manual',
    ) => {
      const id = sessionId
      if (!id) return
      const release = async (confirmed: boolean) => {
        setError(null)
        try {
          await apiRequest(`/api/leases/${id}/release`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
          })
        } finally {
          await clearLocalLease(confirmed)
        }
      }
      if (reason === 'manual') await runRef.current(release)
      else await release(false)
    },
    [clearLocalLease, sessionId],
  )

  useEffect(() => {
    if (!user && sessionId)
      void releaseLease('logout').catch((cause) => setError(String(cause)))
  }, [releaseLease, sessionId, user])

  useEffect(() => {
    const handleLogout = () => {
      if (sessionId)
        void releaseLease('logout').catch((cause) => setError(String(cause)))
    }
    window.addEventListener('laap:logout', handleLogout)
    return () => window.removeEventListener('laap:logout', handleLogout)
  }, [releaseLease, sessionId, provisioning])

  const persistLease = (nextSessionId: string, accountId: string) => {
    leaseOwner.current = nextSessionId
    setSessionId(nextSessionId)
    setActiveAccountId(accountId)
    if (!user) return
    try {
      localStorage.setItem(
        ACTIVE_LEASE_KEY,
        JSON.stringify({
          userId: user.id,
          deviceId: deviceId ?? undefined,
          sessionId: nextSessionId,
          accountId,
        } satisfies PersistedLease),
      )
    } catch {}
  }

  const acquireAndLaunch = async (
    accId: string,
    onStepChange?: (step: string) => void,
  ) =>
    operations.run(
      async (confirmed) => {
        if (!hasTauri)
          throw new Error(deviceError || 'Desktop environment not detected.')
        setError(null)
        let acquiredSessionId: string | null = null
        try {
          if (sessionId)
            await apiRequest(`/api/leases/${sessionId}/release`, {
              method: 'POST',
              body: JSON.stringify({ reason: 'manual' }),
            })
          onStepChange?.('Securing account lease…')
          const result = await apiRequest<{ sessionId: string }>(
            '/api/leases/acquire',
            {
              method: 'POST',
              body: JSON.stringify({
                accountId: accId,
                deviceId: deviceId ?? undefined,
              }),
            },
          )
          acquiredSessionId = result.sessionId
          persistLease(result.sessionId, accId)
          setLeaseState('ACTIVE')

          onStepChange?.('Preparing Riot Client…')
          const sessionRes = await apiRequest<{ sessionBlob: string }>(
            `/api/leases/${result.sessionId}/session-blob`,
          )
          await invokeTauri('switch_account_session', {
            sessionYaml: sessionRes.sessionBlob,
            confirmed,
            ownerId: `cloud:${result.sessionId}`,
          })
          await loadAccounts()
        } catch (cause) {
          if (acquiredSessionId) {
            await apiRequest(`/api/leases/${acquiredSessionId}/release`, {
              method: 'POST',
              body: JSON.stringify({ reason: 'error' }),
            }).catch(() => {})
          }
          if (acquiredSessionId) {
            setSessionId(null)
            setActiveAccountId(null)
            setLeaseState('IDLE')
            clearPersistedLease()
          }
          throw cause
        }
      },
      { launchKey: `cloud:${accId}` },
    )


  // Restore a lease after a normal app restart
  useEffect(() => {
    if (!user || sessionId) return
    try {
      const stored = JSON.parse(
        localStorage.getItem(ACTIVE_LEASE_KEY) ?? 'null',
      ) as PersistedLease | null
      if (!stored || stored.userId !== user.id) return
      leaseOwner.current = stored.sessionId
      setSessionId(stored.sessionId)
      setActiveAccountId(stored.accountId)
      setLeaseState('ACTIVE')
      void apiRequest(`/api/leases/${stored.sessionId}/heartbeat`, {
        method: 'POST',
        body: JSON.stringify({ runtimeState: 'IN_CLIENT' }),
      }).catch(() => {
        void clearLocalLease()
      })
    } catch {
      clearPersistedLease()
    }
  }, [clearLocalLease, sessionId, user])

  // Simple, relaxed liveness check (every 60s)
  useEffect(() => {
    if (!sessionId || !hasTauri) return
    let disposed = false
    let riotWasSeen = false
    const launchedAt = Date.now()
    let tickPending = false
    let consecutiveClosedChecks = 0
    missedHeartbeats.current = 0

    const tick = async () => {
      if (disposed || tickPending) return
      tickPending = true
      try {
        const isRunning = await invokeTauri<boolean>('is_riot_running')
        if (isRunning) {
          riotWasSeen = true
          consecutiveClosedChecks = 0
        } else if (riotWasSeen || Date.now() - launchedAt >= 30_000) {
          consecutiveClosedChecks += 1
          // If Riot Client was closed for 2 consecutive checks (~2 minutes), release lease
          if (consecutiveClosedChecks >= 2) {
            await releaseLease('process_exit')
            return
          }
        }

        await apiRequest(`/api/leases/${sessionId}/heartbeat`, {
          method: 'POST',
          body: JSON.stringify({ runtimeState: 'IN_CLIENT' }),
        })
        missedHeartbeats.current = 0
      } catch (cause) {
        missedHeartbeats.current += 1
        const message = cause instanceof Error ? cause.message : String(cause)
        if (
          (cause instanceof ApiError &&
            [
              'SESSION_NOT_FOUND',
              'ASSIGNMENT_EXPIRED',
              'UNAUTHENTICATED',
            ].includes(cause.code)) ||
          /SESSION_NOT_FOUND|ASSIGNMENT_EXPIRED|UNAUTHENTICATED/i.test(message)
        ) {
          setLeaseState('LEASE_LOST')
          setError(message)
          await clearLocalLease()
          setError(message)
          return
        }
        if (missedHeartbeats.current >= 4) {
          setLeaseState('LEASE_LOST')
          setError(message)
          await clearLocalLease()
          setError(message)
        }
      } finally {
        tickPending = false
      }
    }

    void tick()
    const timer = window.setInterval(() => {
      void tick()
    }, HEARTBEAT_INTERVAL_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [clearLocalLease, releaseLease, sessionId])

  // Release lease when the desktop window is closed
  useEffect(() => {
    if (!sessionId || !hasTauri || provisioning) return
    let unlisten: (() => void) | undefined
    let closing = false
    void import('@tauri-apps/api/window')
      .then(async ({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow()
        unlisten = await appWindow.onCloseRequested(async (event) => {
          if (closing) return
          event.preventDefault()
          closing = true
          await releaseLease('logout').catch(() => {})
          await appWindow.destroy()
        })
      })
      .catch(() => {})
    return () => {
      unlisten?.()
    }
  }, [releaseLease, sessionId, provisioning])

  const deleteCloudAccount = async (id: string) => {
    setError(null)
    await apiRequest(`/api/accounts/${id}`, { method: 'DELETE' })
    await loadAccounts()
  }
  const uploadSessionBlob = async (accountId: string, sessionBlob: string) => {
    setError(null)
    await apiRequest(`/api/accounts/${accountId}/session-blob`, {
      method: 'PUT',
      body: JSON.stringify({ sessionBlob }),
    })
  }
  const forceReleaseCloudAccount = async (id: string) => {
    setError(null)
    await apiRequest(`/api/accounts/${id}/release`, { method: 'POST' })
    await loadAccounts()
  }
  const revokeCloudSessionBlob = async (id: string) => {
    setError(null)
    await apiRequest(`/api/accounts/${id}/session-blob`, { method: 'DELETE' })
    await loadAccounts()
  }
  const cancelSandbox = useCallback(async () => {
    sandboxGeneration.current++
    const id = sandboxTicket.current
    if (id) {
      const cancel = (confirmed: boolean) =>
        invokeTauri('cancel_provisioning_session', {
          provisioningId: id,
          confirmed,
        })
      if (cloudMounted.current) await runRef.current(cancel)
      else await cancel(false)
      if (sandboxTicket.current === id) sandboxTicket.current = null
    }
    setProvisioning(false)
    if (id)
      window.dispatchEvent(
        new CustomEvent('laap:provisioning', { detail: false }),
      )
  }, [])
  useEffect(() => {
    cloudMounted.current = true
    const provisioningCancelled = (event: Event) => {
      if ((event as CustomEvent<boolean>).detail !== false) return
      sandboxGeneration.current++
      sandboxTicket.current = null
      setProvisioning(false)
    }
    window.addEventListener('laap:provisioning', provisioningCancelled)
    return () => {
      window.removeEventListener('laap:provisioning', provisioningCancelled)
      cloudMounted.current = false
      void cancelSandbox().catch((cause) =>
        console.error('Unable to cancel shared sign-in:', String(cause)),
      )
    }
  }, [cancelSandbox])
  const startSandbox = async () => {
    const version = ++sandboxGeneration.current
    await operations.run(async (confirmed) => {
      const id = await invokeTauri<string>('start_provisioning_session', {
        confirmed,
      })
      if (version !== sandboxGeneration.current) {
        await invokeTauri('cancel_provisioning_session', { provisioningId: id })
        return
      }
      sandboxTicket.current = id
      setProvisioning(true)
      window.dispatchEvent(
        new CustomEvent('laap:provisioning', { detail: true }),
      )
    })
  }
  const pollSandbox = async (): Promise<string | null> => {
    const id = sandboxTicket.current
    return id
      ? invokeTauri<string | null>('poll_provisioning_session', {
          provisioningId: id,
        })
      : null
  }
  useNativeClose(
    provisioning || !!sessionId,
    async () => {
      await cancelSandbox()
      await releaseLease('logout')
    },
    (cause) => setError(String(cause)),
  )
  const finishSandbox = cancelSandbox

  return {
    accounts,
    loading,
    error: error || deviceError,
    sessionId,
    activeAccountId,
    leaseState,
    provisioning,
    deviceId,
    loadAccounts,
    refetch: loadAccounts,
    acquireAndLaunch,
    releaseLease,
    deleteCloudAccount,
    uploadSessionBlob,
    forceReleaseCloudAccount,
    revokeCloudSessionBlob,
    startSandbox,
    pollSandbox,
    finishSandbox,
    cancelSandbox,
  }
}
