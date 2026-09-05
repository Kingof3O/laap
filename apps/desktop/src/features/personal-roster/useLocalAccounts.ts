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
          { id: 'acc-1', name: 'Hide on bush', region: 'KR', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 2).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-2', name: 'Caps', region: 'EUW', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 5).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-3', name: 'Agurin', region: 'EUW', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 14).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-4', name: 'Doublelift', region: 'NA', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 26).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-5', name: 'T1 Gumayusi', region: 'KR', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 32).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-6', name: 'Jojopyun', region: 'NA', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 48).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-7', name: 'ShowMaker', region: 'KR', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 54).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-8', name: 'Bo', region: 'EUW', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 70).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-9', name: 'Bwipo', region: 'NA', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 85).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-10', name: 'Chovy', region: 'KR', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 96).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-11', name: 'Nemesis', region: 'KR', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 120).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-12', name: 'Upset', region: 'EUW', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 132).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-13', name: 'Inspired', region: 'NA', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 150).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-14', name: 'Jankos', region: 'EUNE', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 168).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-15', name: 'Faker Mid', region: 'KR', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 190).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-16', name: 'Hans Sama', region: 'EUW', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 210).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-17', name: 'Perkz', region: 'EUNE', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 240).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-18', name: 'Sniper', region: 'NA', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 260).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-19', name: 'Robo', region: 'BR', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 280).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-20', name: 'Tinowns', region: 'BR', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 320).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-21', name: 'Caliste', region: 'EUW', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 350).toISOString(), created_at: new Date().toISOString() },
          { id: 'acc-22', name: 'Rekkles', region: 'KR', has_session: true, last_used_at: new Date(Date.now() - 3600000 * 400).toISOString(), created_at: new Date().toISOString() },
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

  useEffect(() => {
    const handleRefresh = () => { void loadAccounts() }
    window.addEventListener('laap:refresh', handleRefresh)
    return () => window.removeEventListener('laap:refresh', handleRefresh)
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
