import { useEffect, useMemo, useState } from 'react'
import { EmptyState, AccountRosterDisplay, DeleteConfirmModal } from '../../shared/ui'
import { ActiveLeaseBanner } from './ActiveLeaseBanner'
import { SyncAccountModal } from './SyncAccountModal'
import { LoginView } from '../auth/LoginView'
import { useCloudAccounts } from './useCloudAccounts'
import { useLocalAccounts } from '../personal-roster/useLocalAccounts'
import { useProvisioningSandbox } from '../../shared/hooks/useProvisioningSandbox'
import { useToast } from '../../context/ToastContext'
import type { Account, Region, User, ViewMode } from '../../lib/types'

interface TeamVaultViewProps {
  user: User | null
  searchQuery: string
  selectedRegion: Region
  viewMode: ViewMode
  onLogin: (email: string, pass: string, remember: boolean) => Promise<void>
  loginBusy: boolean
  authError: string | null
  onCountChange?: (count: number) => void
}

export function TeamVaultView({
  user,
  searchQuery,
  selectedRegion,
  viewMode,
  onLogin,
  loginBusy,
  authError,
  onCountChange,
}: TeamVaultViewProps) {
  const { showSuccess, showError } = useToast()
  const [syncTarget, setSyncTarget] = useState<Account | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const {
    accounts: cloudAccounts,
    loadAccounts: reloadCloud,
    acquireAndLaunch,
    releaseLease,
    deleteCloudAccount,
    uploadSessionBlob,
    forceReleaseCloudAccount,
    revokeCloudSessionBlob,
    sessionId: cloudSessionId,
    activeAccountId: cloudActiveAccountId,
    startSandbox: startCloudSandbox,
    pollSandbox,
    finishSandbox,
    provisioning,
  } = useCloudAccounts(user)

  const { localAccounts, getFullAccount, captureActive: captureActiveLocal } = useLocalAccounts()

  // Automatic background poller for the Riot sign-in sandbox
  useProvisioningSandbox({
    active: provisioning,
    pollFn: pollSandbox,
    onCapture: async (captured) => {
      if (syncTarget) {
        showSuccess('Session captured! Uploading to profile…')
        await uploadSessionBlob(syncTarget.id, captured)
        await finishSandbox()
        setSyncTarget(null)
        showSuccess(`Profile "${syncTarget.name}" synced and ready to play!`)
        await reloadCloud()
      } else {
        await finishSandbox()
      }
    },
    onError: (err) => showError(err.message),
  })

  const filteredAccounts = useMemo(() => {
    return cloudAccounts.filter((acc) => {
      const matchRegion = selectedRegion === 'ALL' || acc.region.toUpperCase() === selectedRegion
      const matchSearch =
        !searchQuery.trim() ||
        `${acc.name} ${acc.region}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
      return matchRegion && matchSearch
    })
  }, [cloudAccounts, selectedRegion, searchQuery])

  useEffect(() => {
    onCountChange?.(filteredAccounts.length)
  }, [filteredAccounts.length, onCountChange])

  const activeAccount = useMemo(() => {
    return cloudAccounts.find((a) => a.id === cloudActiveAccountId)
  }, [cloudAccounts, cloudActiveAccountId])

  const handleLaunch = async (id: string) => {
    setBusy(true)
    try {
      await acquireAndLaunch(id, (step) => showSuccess(step))
      showSuccess('Launching League of Legends with claimed account!')
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleRelease = async () => {
    setBusy(true)
    try {
      await releaseLease()
      showSuccess('Account released back to Shared Pool.')
      await reloadCloud()
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleForceRelease = async (id: string) => {
    setBusy(true)
    showSuccess('Force releasing account…')
    try {
      await forceReleaseCloudAccount(id)
      showSuccess('Account has been force-released and is now available.')
      await reloadCloud()
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleRevokeSession = async (id: string) => {
    setBusy(true)
    showSuccess('Revoking stored session token…')
    try {
      await revokeCloudSessionBlob(id)
      showSuccess('Session token removed. Profile requires sync before play.')
      await reloadCloud()
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleLinkLocal = async (cloudAccountId: string, localId: string) => {
    setBusy(true)
    showSuccess('Linking local session…')
    try {
      const full = await getFullAccount(localId)
      if (!full || !full.session_blob) {
        throw new Error('Selected profile has no valid session.')
      }
      await uploadSessionBlob(cloudAccountId, full.session_blob)
      setSyncTarget(null)
      showSuccess('Account synced and ready to play!')
      await reloadCloud()
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleSyncActive = async (cloudAccountId: string) => {
    setBusy(true)
    showSuccess('Uploading active login…')
    try {
      const activeSession = await captureActiveLocal()
      if (!activeSession) {
        throw new Error('No active Riot login found on this machine.')
      }
      await uploadSessionBlob(cloudAccountId, activeSession)
      setSyncTarget(null)
      showSuccess('Account synced and ready to play!')
      await reloadCloud()
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    showSuccess(`Removing "${deleteTarget.name}"…`)
    try {
      await deleteCloudAccount(deleteTarget.id)
      showSuccess(`Profile "${deleteTarget.name}" removed.`)
      setDeleteTarget(null)
      await reloadCloud()
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!user) {
    return (
      <LoginView
        onLogin={async (em, pw, rem) => {
          await onLogin(em, pw, rem)
          await reloadCloud()
        }}
        busy={loginBusy}
        error={authError}
      />
    )
  }

  return (
    <div>
      {/* Active Held Lease Banner */}
      {cloudSessionId && activeAccount ? (
        <ActiveLeaseBanner
          account={activeAccount}
          onRelaunch={() => void handleLaunch(activeAccount.id)}
          onRelease={() => void handleRelease()}
          busy={busy}
        />
      ) : null}

      {/* Team Accounts Roster */}
      {filteredAccounts.length === 0 ? (
        <EmptyState
          isCloud={true}
          searchActive={Boolean(searchQuery || selectedRegion !== 'ALL')}
        />
      ) : (
        <AccountRosterDisplay
          items={filteredAccounts.map((acc) => ({
            id: acc.id,
            name: acc.name,
            region: acc.region,
            hasSession: Boolean(acc.hasSessionBlob),
            lastUsedText: acc.lastUsed || null,
            status: acc.status,
          }))}
          viewMode={viewMode}
          isCloud={true}
          canManage={user.role === 'admin'}
          busy={busy}
          onLaunch={handleLaunch}
          onSync={(id) => {
            const acc = filteredAccounts.find((a) => a.id === id)
            if (acc) setSyncTarget(acc)
          }}
          onForceRelease={handleForceRelease}
          onRevokeSession={handleRevokeSession}
          onDelete={(id, name) => setDeleteTarget({ id, name })}
        />
      )}

      {/* Sync Account Modal */}
      <SyncAccountModal
        targetAccount={syncTarget}
        localAccounts={localAccounts}
        isOpen={Boolean(syncTarget)}
        onClose={() => setSyncTarget(null)}
        onLinkFromLocal={handleLinkLocal}
        onSyncActive={handleSyncActive}
        onStartSandbox={async () => {
          await startCloudSandbox()
        }}
        busy={busy}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        target={deleteTarget}
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        busy={busy}
      />
    </div>
  )
}
