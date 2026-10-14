import { useNativeClose } from '../../shared/hooks/useNativeClose'
import { useCallback, useEffect, useRef, useState } from 'react'
import { invokeTauri, isTauriAvailable } from '../../lib/api'
import { invalidateIcons } from '../../lib/iconCache'
import { useRiotOperations } from '../../context/RiotOperations'
import type {
  CapturedProfile,
  LocalAccountFull,
  LocalAccountSummary,
  ProfileDetails,
  ProfileCustomization,
} from '../../lib/types'
const asError = (cause: unknown) =>
  cause instanceof Error ? cause : new Error(String(cause))
export function useLocalAccounts() {
  const [localAccounts, setLocalAccounts] = useState<LocalAccountSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [provisioning, setProvisioning] = useState(false)
  const ticket = useRef<string | null>(null)
  const generation = useRef(0)
  const requests = useRef(0)
  const mounted = useRef(true)
  const operations = useRiotOperations()
  const { run } = operations
  const operationState = useRef(operations)
  operationState.current = operations
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<
    'idle' | 'syncing' | 'waiting' | 'success' | 'error'
  >('idle')
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<Date | null>(
    null,
  )
  const syncPending = useRef(false)
  const syncEpoch = useRef(0)
  const runRef = useRef(run)
  runRef.current = run
  const loadAccounts = useCallback(async () => {
    const request = ++requests.current
    setLoading(true)
    setError(null)
    try {
      for (let retry = 0; retry < 10 && !isTauriAvailable(); retry++)
        await new Promise((resolve) => window.setTimeout(resolve, 100))
      if (!isTauriAvailable()) throw new Error('Tauri IPC bridge unavailable')
      const accounts = await invokeTauri<LocalAccountSummary[]>(
        'list_local_accounts',
      )
      if (mounted.current && request === requests.current)
        setLocalAccounts(accounts)
    } catch (cause) {
      if (mounted.current && request === requests.current) {
        setLocalAccounts([])
        setError(asError(cause))
      }
    } finally {
      if (mounted.current && request === requests.current) setLoading(false)
    }
  }, [])
  const cancelSandbox = useCallback(async () => {
    generation.current++
    const owned = ticket.current
    if (owned) {
      const cancel = (confirmed: boolean) =>
        invokeTauri('cancel_provisioning_session', {
          provisioningId: owned,
          confirmed,
        })
      if (mounted.current) await runRef.current(cancel)
      else await cancel(false)
      if (ticket.current === owned) ticket.current = null
    }
    if (mounted.current) setProvisioning(false)
    if (owned)
      window.dispatchEvent(
        new CustomEvent('laap:provisioning', { detail: false }),
      )
  }, [])
  useEffect(() => {
    mounted.current = true
    void loadAccounts()
    const refresh = () => void loadAccounts()
    const provisioningCancelled = (event: Event) => {
      if ((event as CustomEvent<boolean>).detail !== false) return
      generation.current++
      ticket.current = null
      setProvisioning(false)
    }
    window.addEventListener('laap:refresh', refresh)
    window.addEventListener('laap:provisioning', provisioningCancelled)
    return () => {
      mounted.current = false
      requests.current++
      window.removeEventListener('laap:refresh', refresh)
      window.removeEventListener('laap:provisioning', provisioningCancelled)
      void cancelSandbox().catch((cause) =>
        console.error('Unable to restore Riot sign-in:', String(cause)),
      )
    }
  }, [loadAccounts, cancelSandbox])
  useNativeClose(provisioning, cancelSandbox, (cause) =>
    setError(asError(cause)),
  )
  const syncSignature = localAccounts
    .filter(
      (account) =>
        account.customization?.auto_sync_icon ||
        account.customization?.auto_sync_rank,
    )
    .map(
      (account) =>
        `${account.id}:${account.customization?.auto_sync_icon}:${account.customization?.auto_sync_rank}`,
    )
    .sort()
    .join('|')
  const syncNow = useCallback(async () => {
    if (
      syncPending.current ||
      operationState.current.busy ||
      operationState.current.provisioning
    )
      return
    syncPending.current = true
    const epoch = syncEpoch.current
    let syncedChanges = false
    setSyncState('syncing')
    setSyncMessage(
      'Syncing enabled icons and Solo/Duo ranks from League Client…',
    )
    try {
      const result = await invokeTauri<{
        changed: boolean
        message: string | null
        state?: 'waiting' | 'success' | 'error'
      }>('sync_profile_customizations')
      if (mounted.current && epoch === syncEpoch.current) {
        syncedChanges = result.changed
        setSyncState(result.state ?? (result.message ? 'waiting' : 'success'))
        setSyncMessage(result.message ?? 'Enabled profile data is up to date.')
        setLastSyncAt(new Date())
        if (result.state === 'success') setLastSuccessfulSyncAt(new Date())
        if (result.changed) {
          invalidateIcons()
          window.dispatchEvent(new Event('laap:icons-updated'))
          // Refresh quietly: keep the roster and its controls visible during sync.
          const accounts = await invokeTauri<LocalAccountSummary[]>(
            'list_local_accounts',
          )
          if (mounted.current && epoch === syncEpoch.current)
            setLocalAccounts(accounts)
        }
      }
    } catch (cause) {
      if (mounted.current && epoch === syncEpoch.current) {
        setSyncState('error')
        setSyncMessage(
          syncedChanges
            ? `Profile data synced, but the roster could not refresh: ${String(cause)}. Use Refresh Accounts.`
            : `Sync failed: ${String(cause)}. Saved data was kept. Try Sync now again.`,
        )
        setLastSyncAt(new Date())
      }
    } finally {
      syncPending.current = false
      if (mounted.current && epoch !== syncEpoch.current) {
        setSyncState('waiting')
        setSyncMessage(
          'Sync options changed. Use Sync now to check the saved settings.',
        )
      }
    }
  }, [])
  useEffect(() => {
    if (!syncSignature) {
      setSyncMessage(null)
      setSyncState('idle')
      return
    }
    void syncNow()
    const timer = window.setInterval(() => void syncNow(), 20000)
    return () => {
      syncEpoch.current++
      window.clearInterval(timer)
    }
  }, [syncSignature, syncNow])
  const saveAccount = async (
    name: string,
    region: string,
    sessionBlob: string,
    rank = '',
    notes = '',
    favorite = false,
    customization?: ProfileCustomization,
  ) => {
    const saved = await invokeTauri<LocalAccountSummary>('save_local_account', {
      name: name.trim(),
      region,
      sessionBlob,
      rank: rank.trim() || null,
      notes,
      favorite,
      customization,
    })
    await loadAccounts()
    return saved
  }
  const editAccount = async (id: string, details: ProfileDetails) => {
    await invokeTauri('edit_local_account', { id, details })
    await loadAccounts()
  }
  const deleteAccount = async (id: string) => {
    await invokeTauri('delete_local_account', { id })
    await loadAccounts()
  }
  const launchAccount = async (id: string) => {
    await run(
      (confirmed) => invokeTauri('launch_local_account', { id, confirmed }),
      { launchKey: `local:${id}` },
    )
    await loadAccounts()
  }
  const captureActive = () =>
    invokeTauri<string | null>('capture_active_session')
  const detectActive = () =>
    invokeTauri<CapturedProfile | null>('detect_active_profile')
  const startSandbox = async () => {
    const version = ++generation.current
    await run(async (confirmed) => {
      const id = await invokeTauri<string>('start_provisioning_session', {
        confirmed,
      })
      if (!mounted.current || version !== generation.current) {
        await invokeTauri('cancel_provisioning_session', { provisioningId: id })
        return
      }
      ticket.current = id
      setProvisioning(true)
      window.dispatchEvent(
        new CustomEvent('laap:provisioning', { detail: true }),
      )
    })
  }
  const pollSandbox = useCallback(async () => {
    const id = ticket.current
    if (!id) return null
    return invokeTauri<string | null>('poll_provisioning_session', {
      provisioningId: id,
    })
  }, [])
  const completeSandbox = async (
    details: ProfileDetails,
    profileId?: string,
  ) => {
    const id = ticket.current
    if (!id) throw new Error('This sign-in has been cancelled.')
    await runRef.current((confirmed) =>
      invokeTauri('complete_local_provisioning', {
        provisioningId: id,
        profileId: profileId ?? null,
        details,
        confirmed,
      }),
    )
    ticket.current = null
    setProvisioning(false)
    window.dispatchEvent(
      new CustomEvent('laap:provisioning', { detail: false }),
    )
    await loadAccounts()
  }
  const finishSandbox = cancelSandbox
  const getFullAccount = (id: string) =>
    invokeTauri<LocalAccountFull>('get_local_account', { id })
  return {
    syncMessage,
    syncState,
    syncNow,
    lastSyncAt,
    lastSuccessfulSyncAt,
    syncEnabled: Boolean(syncSignature),
    accounts: localAccounts,
    localAccounts,
    loading,
    error,
    setError,
    provisioning,
    refetch: loadAccounts,
    loadAccounts,
    saveAccount,
    editAccount,
    deleteAccount,
    launchAccount,
    captureActive,
    detectActive,
    startSandbox,
    cancelSandbox,
    pollSandbox,
    completeSandbox,
    finishSandbox,
    getFullAccount,
  }
}
