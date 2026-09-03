import { useCallback, useEffect, useState } from 'react'
import { apiRequest, hasTauri, invokeTauri } from '../lib/api'
import { useDevice } from '../features/device'
import type { Account, User } from '../lib/types'

export function useCloudAccounts(user: User | null) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [provisioning, setProvisioning] = useState(false)

  // Hardware device identity isolated via useDevice
  const { deviceId, error: deviceError } = useDevice(user)

  const loadAccounts = useCallback(async () => {
    if (!user) {
      setAccounts([])
      return
    }
    setLoading(true)
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
    if (user) {
      void loadAccounts()
    }
  }, [user, loadAccounts])

  const acquireAndLaunch = async (accId: string, onStepChange?: (step: string) => void) => {
    if (!deviceId || !hasTauri) {
      throw new Error(deviceError || 'Device is initializing. Please wait a moment.')
    }
    setError(null)
    onStepChange?.('Securing account lease…')

    const nonce = `${Date.now()}:${accId}`
    const signature = await invokeTauri<string>('sign_device_nonce', { nonce })
    const result = await apiRequest<{ sessionId: string }>('/api/leases/acquire', {
      method: 'POST',
      body: JSON.stringify({
        accountId: accId,
        deviceId,
        nonce,
        signature,
      }),
    })

    setSessionId(result.sessionId)
    setActiveAccountId(accId)

    onStepChange?.('Injecting credentials…')
    const sessionRes = await apiRequest<{ sessionBlob: string }>(
      `/api/leases/${result.sessionId}/session-blob`
    )

    await invokeTauri('inject_account_session', { sessionYaml: sessionRes.sessionBlob })

    onStepChange?.('Launching League of Legends…')
    await invokeTauri('launch_riot_client')
    await loadAccounts()
  }

  const releaseLease = async () => {
    if (!sessionId) return
    setError(null)
    try {
      await apiRequest(`/api/leases/${sessionId}/release`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'manual' }),
      })
    } finally {
      setSessionId(null)
      setActiveAccountId(null)
      if (hasTauri) {
        await invokeTauri('cleanup_account_session').catch(() => {})
      }
      await loadAccounts()
    }
  }

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

  const startSandbox = async () => {
    if (!hasTauri) return
    setError(null)
    setProvisioning(true)
    try {
      await invokeTauri('start_provisioning_session')
    } catch (cause) {
      setProvisioning(false)
      throw cause
    }
  }

  const pollSandbox = async (): Promise<string | null> => {
    if (!hasTauri) return null
    return invokeTauri<string | null>('poll_provisioning_session')
  }

  const finishSandbox = async () => {
    if (!hasTauri) return
    try {
      await invokeTauri('finish_provisioning_session')
    } finally {
      setProvisioning(false)
    }
  }

  const cancelSandbox = async () => {
    if (!hasTauri) return
    try {
      await invokeTauri('cancel_provisioning_session')
    } finally {
      setProvisioning(false)
    }
  }

  return {
    accounts,
    loading,
    error: error || deviceError,
    sessionId,
    activeAccountId,
    provisioning,
    deviceId,
    loadAccounts,
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
