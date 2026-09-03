import { useCallback, useEffect, useState } from 'react'
import { hasTauri, invokeTauri } from '../../lib/api'
import type { LocalAccountFull, LocalAccountSummary } from '../../lib/types'

export function useLocalAccounts() {
  const [localAccounts, setLocalAccounts] = useState<LocalAccountSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provisioning, setProvisioning] = useState(false)

  const loadAccounts = useCallback(async () => {
    if (!hasTauri) {
      const stored = localStorage.getItem('laap_browser_accounts')
      if (stored) {
        try {
          setLocalAccounts(JSON.parse(stored))
        } catch {}
      } else {
        const samples: LocalAccountSummary[] = [
          { id: 'acc-1', name: 'Hide on bush', region: 'KR', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 3).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-2', name: 'Caps', region: 'EUW', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 18).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-3', name: 'Agurin', region: 'EUW', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 42).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-4', name: 'Doublelift', region: 'NA', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 72).toISOString(), created_at: new Date().toISOString() },
        ]
        localStorage.setItem('laap_browser_accounts', JSON.stringify(samples))
        setLocalAccounts(samples)
      }
      return
    }
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
    if (!hasTauri) {
      const newAcc: LocalAccountSummary = {
        id: `acc-${Date.now()}`,
        name: name.trim(),
        region,
        has_session: true,
        last_used_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }
      const updated = [...localAccounts, newAcc]
      localStorage.setItem('laap_browser_accounts', JSON.stringify(updated))
      setLocalAccounts(updated)
      return newAcc
    }
    const result = await invokeTauri<LocalAccountSummary>('save_local_account', {
      name: name.trim(),
      region,
      sessionBlob,
    })
    await loadAccounts()
    return result
  }

  const deleteAccount = async (id: string) => {
    if (!hasTauri) {
      const updated = localAccounts.filter((a) => a.id !== id)
      localStorage.setItem('laap_browser_accounts', JSON.stringify(updated))
      setLocalAccounts(updated)
      return
    }
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
