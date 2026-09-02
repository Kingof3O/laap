import { useEffect, useMemo, useState } from 'react'
import { Play, Square } from 'lucide-react'
import { AccountCard } from '../components/accounts/AccountCard'
import { AccountListTable } from '../components/accounts/AccountListTable'
import { EmptyState } from '../components/accounts/EmptyState'
import { LoginView } from '../components/auth/LoginView'
import { SyncAccountModal } from '../components/modals/SyncAccountModal'
import { DeleteConfirmModal } from '../components/modals/DeleteConfirmModal'
import { useCloudAccounts } from '../hooks/useCloudAccounts'
import { useLocalAccounts } from '../hooks/useLocalAccounts'
import { useToast } from '../context/ToastContext'
import type { Account, Region, User, ViewMode } from '../lib/types'

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
    sessionId: cloudSessionId,
    activeAccountId: cloudActiveAccountId,
    startSandbox: startCloudSandbox,
  } = useCloudAccounts(user)

  const { localAccounts, getFullAccount, captureActive: captureActiveLocal } = useLocalAccounts()

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
      showSuccess('Account released back to Team Vault.')
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
      showSuccess('Team account synced and ready to play!')
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
      showSuccess('Team account synced and ready to play!')
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
        <div className="hextech-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div className="card-avatar" style={{ width: '48px', height: '48px' }}>
                <span className="avatar-initials">{activeAccount.name.slice(0, 2).toUpperCase()}</span>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800 }}>
                    {activeAccount.name}
                  </span>
                  <span className="avatar-region-pip" style={{ position: 'static' }}>
                    {activeAccount.region}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--teal-primary)', fontWeight: 600 }}>
                  ● Active Team Session Held
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-launch-primary"
                style={{ width: 'auto', padding: '0 20px' }}
                onClick={() => void handleLaunch(activeAccount.id)}
                disabled={busy}
              >
                <Play size={14} fill="currentColor" />
                <span>Relaunch League</span>
              </button>
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => void handleRelease()}
                disabled={busy}
              >
                <Square size={13} />
                <span>Release Account</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Team Accounts View */}
      {filteredAccounts.length === 0 ? (
        <EmptyState
          isCloud={true}
          searchActive={Boolean(searchQuery || selectedRegion !== 'ALL')}
        />
      ) : viewMode === 'grid' ? (
        <div className="roster-grid">
          {filteredAccounts.map((acc) => (
            <AccountCard
              key={acc.id}
              id={acc.id}
              name={acc.name}
              region={acc.region}
              hasSession={Boolean(acc.hasSessionBlob)}
              isCloud={true}
              canManage={user.role === 'admin'}
              busy={busy}
              onLaunch={() => void handleLaunch(acc.id)}
              onSync={() => setSyncTarget(acc)}
              onDelete={() => setDeleteTarget({ id: acc.id, name: acc.name })}
            />
          ))}
        </div>
      ) : (
        <AccountListTable
          items={filteredAccounts.map((acc) => ({
            id: acc.id,
            name: acc.name,
            region: acc.region,
            hasSession: Boolean(acc.hasSessionBlob),
            lastUsedText: acc.lastUsed || null,
          }))}
          isCloud={true}
          canManage={user.role === 'admin'}
          busy={busy}
          onLaunch={(id) => void handleLaunch(id)}
          onSync={(id) => {
            const acc = filteredAccounts.find((a) => a.id === id)
            if (acc) setSyncTarget(acc)
          }}
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
