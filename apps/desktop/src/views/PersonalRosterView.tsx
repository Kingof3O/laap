import { useEffect, useMemo, useState } from 'react'
import { AccountCard } from '../components/accounts/AccountCard'
import { AccountListTable } from '../components/accounts/AccountListTable'
import { EmptyState } from '../components/accounts/EmptyState'
import { AddAccountModal } from '../components/modals/AddAccountModal'
import { DeleteConfirmModal } from '../components/modals/DeleteConfirmModal'
import { useLocalAccounts } from '../hooks/useLocalAccounts'
import { useToast } from '../context/ToastContext'
import type { Region, ViewMode } from '../lib/types'

interface PersonalRosterViewProps {
  searchQuery: string
  selectedRegion: Region
  viewMode: ViewMode
  isAdmin: boolean
  showAddModal: boolean
  onCloseAddModal: () => void
  onOpenAddModal: () => void
  onPushToCloud?: (name: string, region: string, sessionBlob: string) => Promise<void>
  onCountChange?: (count: number) => void
}

export function PersonalRosterView({
  searchQuery,
  selectedRegion,
  viewMode,
  isAdmin,
  showAddModal,
  onCloseAddModal,
  onOpenAddModal,
  onPushToCloud,
  onCountChange,
}: PersonalRosterViewProps) {
  const { showSuccess, showError } = useToast()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const {
    localAccounts,
    loadAccounts,
    saveAccount,
    deleteAccount,
    launchAccount,
    captureActive,
    startSandbox,
    cancelSandbox,
    pollSandbox,
    finishSandbox,
    provisioning,
    getFullAccount,
  } = useLocalAccounts()

  // Sandbox Poller
  useEffect(() => {
    if (!provisioning) return
    const interval = window.setInterval(async () => {
      try {
        const captured = await pollSandbox()
        if (captured) {
          window.clearInterval(interval)
          showSuccess('Session captured! Saving profile…')
          await finishSandbox()
          onCloseAddModal()
          showSuccess('Account saved successfully!')
          await loadAccounts()
        }
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err))
      }
    }, 1500)
    return () => window.clearInterval(interval)
  }, [provisioning, pollSandbox, finishSandbox, loadAccounts, showSuccess, showError, onCloseAddModal])

  // Filter accounts by region and search query
  const filteredAccounts = useMemo(() => {
    return localAccounts.filter((acc) => {
      const matchRegion = selectedRegion === 'ALL' || acc.region.toUpperCase() === selectedRegion
      const matchSearch =
        !searchQuery.trim() ||
        `${acc.name} ${acc.region}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
      return matchRegion && matchSearch
    })
  }, [localAccounts, selectedRegion, searchQuery])

  useEffect(() => {
    onCountChange?.(filteredAccounts.length)
  }, [filteredAccounts.length, onCountChange])

  const handleLaunch = async (id: string) => {
    setBusy(true)
    showSuccess('Launching League of Legends…')
    try {
      await launchAccount(id)
      showSuccess('Game started!')
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleCaptureActive = async (name: string, region: string) => {
    setBusy(true)
    try {
      const activeSession = await captureActive()
      if (!activeSession) {
        throw new Error('No active Riot login found. Please sign into League or Riot Client first.')
      }
      await saveAccount(name, region, activeSession)
      onCloseAddModal()
      showSuccess(`Profile "${name}" registered successfully!`)
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handlePush = async (localId: string) => {
    if (!isAdmin || !onPushToCloud) return
    setBusy(true)
    showSuccess('Publishing account to Team Vault…')
    try {
      const full = await getFullAccount(localId)
      if (!full || !full.session_blob) {
        throw new Error('No valid session stored in this profile.')
      }
      await onPushToCloud(full.name, full.region, full.session_blob)
      showSuccess(`Account "${full.name}" published to Team Vault!`)
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
      await deleteAccount(deleteTarget.id)
      showSuccess(`Profile "${deleteTarget.name}" removed.`)
      setDeleteTarget(null)
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {filteredAccounts.length === 0 ? (
        <EmptyState
          searchActive={Boolean(searchQuery || selectedRegion !== 'ALL')}
          onAddAccount={onOpenAddModal}
        />
      ) : viewMode === 'grid' ? (
        <div className="roster-grid">
          {filteredAccounts.map((acc) => (
            <AccountCard
              key={acc.id}
              id={acc.id}
              name={acc.name}
              region={acc.region}
              hasSession={acc.has_session}
              lastUsedText={acc.last_used_at ? `Played ${new Date(acc.last_used_at).toLocaleDateString()}` : null}
              canManage={true}
              busy={busy}
              onLaunch={() => void handleLaunch(acc.id)}
              onPushToCloud={isAdmin ? () => void handlePush(acc.id) : undefined}
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
            hasSession: acc.has_session,
            lastUsedText: acc.last_used_at ? new Date(acc.last_used_at).toLocaleDateString() : null,
          }))}
          canManage={true}
          busy={busy}
          onLaunch={(id) => void handleLaunch(id)}
          onPushToCloud={isAdmin ? (id) => void handlePush(id) : undefined}
          onDelete={(id, name) => setDeleteTarget({ id, name })}
        />
      )}

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={showAddModal}
        onClose={onCloseAddModal}
        onCaptureActive={handleCaptureActive}
        onStartSandbox={async () => {
          await startSandbox()
        }}
        onCancelSandbox={async () => {
          await cancelSandbox()
        }}
        provisioning={provisioning}
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
