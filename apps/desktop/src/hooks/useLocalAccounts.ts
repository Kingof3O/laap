import { useCallback, useEffect, useState } from 'react'
import { hasTauri, invokeTauri } from '../lib/api'
import type { LocalAccountFull, LocalAccountSummary } from '../lib/types'

export function useLocalAccounts() {
  const [localAccounts, setLocalAccounts] = useState<LocalAccountSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provisioning, setProvisioning] = useState(false)

  const loadAccounts = useCallback(async () => {
    if (!hasTauri) return
    setLoading(true)
    try {
      const list = await invokeTauri<LocalAccountSummary[]>('list_local_accounts')
      setLocalAccounts(list)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const saveAccount = async (name: string, region: string, sessionBlob: string) => {
    if (!hasTauri) return
    const result = await invokeTauri<LocalAccountSummary>('save_local_account', {
      name: name.trim(),
      region,
      sessionBlob,
    })
    await loadAccounts()
    return result
  }

  const deleteAccount = async (id: string) => {
    if (!hasTauri) return
    await invokeTauri('delete_local_account', { id })
    await loadAccounts()
  }

  const launchAccount = async (id: string) => {
    if (!hasTauri) return
    await invokeTauri('launch_local_account', { id })
    await loadAccounts()
  }

  const captureActive = async () => {
    if (!hasTauri) return null
    return invokeTauri<string | null>('capture_active_session')
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

  const pollSandbox = async () => {
    if (!hasTauri) return null
    return invokeTauri<string | null>('poll_provisioning_session')
  }

  const finishSandbox = async () => {
    if (!hasTauri) return
    await invokeTauri('finish_provisioning_session')
    setProvisioning(false)
  }

  const getFullAccount = async (id: string) => {
    if (!hasTauri) return null
    return invokeTauri<LocalAccountFull>('get_local_account', { id })
  }

  return {
    localAccounts,
    loading,
    error,
    setError,
    provisioning,
    loadAccounts,
    saveAccount,
    deleteAccount,
    launchAccount,
    captureActive,
    startSandbox,
    cancelSandbox,
    pollSandbox,
    finishSandbox,
    getFullAccount,
  }
}
