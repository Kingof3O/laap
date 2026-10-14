import { useEffect, useMemo, useState } from 'react'
import { useDialog } from '../../shared/hooks/useDialog'
import { AccountLoadState } from '../../shared/ui/AccountLoadState'
import { useRiotOperations } from '../../context/RiotOperations'
import { RotateCcw, X } from 'lucide-react'
import {
  EmptyState,
  AccountRosterDisplay,
  DeleteConfirmModal,
} from '../../shared/ui'
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
  const operations = useRiotOperations()
  const [syncTarget, setSyncTarget] = useState<Account | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)
  const [forceReleaseTarget, setForceReleaseTarget] = useState<{
    id: string
    name: string
  } | null>(null)
  const [launchingId, setLaunchingId] = useState<string | null>(null)
  const [failedLaunchId, setFailedLaunchId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const forceReleaseDialog = useDialog(
    !!forceReleaseTarget,
    () => setForceReleaseTarget(null),
    busy,
  )

  const {
    accounts: cloudAccounts,
    loading,
    error,
    cancelSandbox,
    loadAccounts: reloadCloud,
    acquireAndLaunch,
    releaseLease,
    deleteCloudAccount,
    uploadSessionBlob,
    forceReleaseCloudAccount,
    revokeCloudSessionBlob,
    sessionId: cloudSessionId,
    activeAccountId: cloudActiveAccountId,
    leaseState: cloudLeaseState,
    startSandbox: startCloudSandbox,
    pollSandbox,
    finishSandbox,
    provisioning,
  } = useCloudAccounts(user)

  const {
    localAccounts,
    getFullAccount,
    captureActive: captureActiveLocal,
  } = useLocalAccounts()

  // Automatic background poller for the Riot sign-in sandbox
  useProvisioningSandbox({
    active: provisioning && !!syncTarget,
    pollFn: pollSandbox,
    onCapture: async (captured) => {
      if (syncTarget) {
        showSuccess('Session captured! Uploading to profile…')
        try {
          await uploadSessionBlob(syncTarget.id, captured)
        } finally {
          await finishSandbox()
        }
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
      const matchRegion =
        selectedRegion === 'ALL' || acc.region.toUpperCase() === selectedRegion
      const matchSearch =
        !searchQuery.trim() ||
        `${acc.name} ${acc.region}`
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase())
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
    setLaunchingId(id)
    setFailedLaunchId(null)
    try {
      await acquireAndLaunch(id)
    } catch (cause) {
      setFailedLaunchId(id)
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
      setLaunchingId(null)
    }
  }

  const handleRelease = async () => {
    setBusy(true)
    try {
      await releaseLease()
      showSuccess('Account released back to Shared Accounts.')
      await reloadCloud()
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleForceRelease = async (id: string) => {
    setBusy(true)
    try {
      await forceReleaseCloudAccount(id)
      showSuccess('Account has been force-released.')
      setForceReleaseTarget(null)
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
          leaseState={cloudLeaseState}
        />
      ) : null}

      {/* Team Accounts Roster */}
      {loading || error ? (
        <AccountLoadState
          loading={loading}
          error={error}
          onRetry={() => void reloadCloud()}
        />
      ) : filteredAccounts.length === 0 ? (
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
          busy={busy || operations.busy || provisioning}
          launchingId={launchingId}
          failedLaunchId={failedLaunchId}
          onLaunch={handleLaunch}
          onSync={(id) => {
            const acc = filteredAccounts.find((a) => a.id === id)
            if (acc) setSyncTarget(acc)
          }}
          onForceRelease={(id) => {
            const acc = filteredAccounts.find((a) => a.id === id)
            if (acc) setForceReleaseTarget({ id: acc.id, name: acc.name })
          }}
          onRevokeSession={handleRevokeSession}
          onDelete={(id, name) => setDeleteTarget({ id, name })}
        />
      )}

      {/* Sync Account Modal */}
      {syncTarget ? (
        <SyncAccountModal
          targetAccount={syncTarget}
          localAccounts={localAccounts}
          isOpen={Boolean(syncTarget)}
          onClose={() => {
            void cancelSandbox()
              .then(() => setSyncTarget(null))
              .catch((cause) => showError(String(cause)))
          }}
          onCancelSandbox={cancelSandbox}
          provisioning={provisioning}
          onLinkFromLocal={handleLinkLocal}
          onSyncActive={handleSyncActive}
          onStartSandbox={async () => {
            await startCloudSandbox()
          }}
          busy={busy || operations.busy}
        />
      ) : null}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        target={deleteTarget}
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        busy={busy}
      />

      {/* Force Release Confirmation Modal */}
      {forceReleaseTarget ? (
        <div className="modal-backdrop">
          <div
            className="modal-panel"
            ref={forceReleaseDialog}
            role="dialog"
            aria-modal="true"
            aria-label="Force release account"
            tabIndex={-1}
          >
            <div className="modal-head">
              <h2 className="modal-title">Force Release Account</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setForceReleaseTarget(null)}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                Are you sure you want to force-release{' '}
                <strong>{forceReleaseTarget.name}</strong>? This will make the
                account available, which may interrupt an active player.
              </p>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => setForceReleaseTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-danger"
                onClick={() => void handleForceRelease(forceReleaseTarget.id)}
                disabled={busy}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <RotateCcw size={13} />
                <span>{busy ? 'Releasing…' : 'Force Release'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
