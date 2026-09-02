import { useCallback, useEffect, useState } from 'react'
import { apiRequest, hasTauri, invokeTauri } from '../lib/api'
import type { Account, User } from '../lib/types'

export function useCloudAccounts(user: User | null) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [provisioning, setProvisioning] = useState(false)

  // Initialize hardware device identity
  useEffect(() => {
    if (!user || !hasTauri) return
    void (async () => {
      try {
        const key = await invokeTauri<string>('device_public_key')
        const platform = await invokeTauri<string>('device_platform').catch(() =>
          /win/i.test(navigator.userAgent) ? 'windows' : 'macos'
        )
        const result = await apiRequest<{ deviceId: string }>('/api/devices', {
          method: 'POST',
          body: JSON.stringify({
            publicKey: key,
            platform: platform === 'windows' ? 'windows' : 'macos',
            deviceName: 'Gaming Launcher',
            appVersion: '1.0.0',
          }),
        })
        setDeviceId(result.deviceId)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
  }, [user])

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
      throw new Error('Device is initializing. Please wait a moment.')
    }
    setError(null)
    onStepChange?.('Securing account lease…')

    const nonce = `${Date.now()}:${accId}`
    const signature = await invokeTauri<string>('sign_device_nonce', { nonce })
    const result = await apiRequest<{ sessionId: string }>('/api/leases/acquire', {
      method: 'POST',
      body: JSON.stringify({ accountId: accId, deviceId, nonce, signature }),
    })
    setSessionId(result.sessionId)
    setActiveAccountId(accId)

    onStepChange?.('Injecting credentials…')
    const blobResult = await apiRequest<{ sessionBlob: string }>(`/api/leases/${result.sessionId}/session-blob`)
    if (!blobResult.sessionBlob || blobResult.sessionBlob.trim().length === 0) {
      throw new Error('This account does not have an active login session yet. Click "Sync" to link it.')
    }

    await invokeTauri('inject_account_session', { sessionYaml: blobResult.sessionBlob })

    onStepChange?.('Launching League of Legends…')
    await invokeTauri('launch_riot_client')
  }

  const releaseLease = async () => {
    if (!sessionId) return
    if (hasTauri) {
      await invokeTauri('cleanup_account_session').catch(() => undefined)
    }
    await apiRequest(`/api/leases/${sessionId}/release`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'manual' }),
    }).catch(() => undefined)
    setSessionId(null)
    setActiveAccountId(null)
  }

  const deleteCloudAccount = async (accId: string) => {
    await apiRequest(`/api/accounts/${accId}`, { method: 'DELETE' })
    await loadAccounts()
  }

  const uploadSessionBlob = async (accId: string, sessionBlob: string) => {
    await apiRequest(`/api/accounts/${accId}/session-blob`, {
      method: 'PUT',
      body: JSON.stringify({ sessionBlob }),
    })
    await loadAccounts()
  }

  const createAndUploadAccount = async (name: string, region: string, sessionBlob: string) => {
    const existing = accounts.find((a) => a.name.toLowerCase() === name.toLowerCase())
    let accId = existing?.id

    if (!accId) {
      const createResult = await apiRequest<{ accountId: string }>('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({
          displayName: name,
          externalId: name,
          region,
          status: 'available',
        }),
      })
      accId = createResult.accountId
    }

    await uploadSessionBlob(accId, sessionBlob)
    await loadAccounts()
  }

  const startSandbox = async () => {
    if (!hasTauri) return
    await invokeTauri('start_provisioning_session')
    setProvisioning(true)
  }

  const cancelSandbox = async () => {
    if (!hasTauri) return
    await invokeTauri('cancel_provisioning_session').catch(() => undefined)
    setProvisioning(false)
  }

  return {
    accounts,
    loading,
    error,
    setError,
    sessionId,
    activeAccountId,
    deviceId,
    provisioning,
    loadAccounts,
    acquireAndLaunch,
    releaseLease,
    deleteCloudAccount,
    uploadSessionBlob,
    createAndUploadAccount,
    startSandbox,
    cancelSandbox,
  }
}
