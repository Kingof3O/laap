import { useEffect, useMemo, useState } from 'react'
import { EmptyState, AccountRosterDisplay, DeleteConfirmModal } from '../../shared/ui'
import { AddAccountModal } from './AddAccountModal'
import { useLocalAccounts } from './useLocalAccounts'
import { useProvisioningSandbox } from '../../shared/hooks/useProvisioningSandbox'
import { useToast } from '../../context/ToastContext'
import type { Region, ViewMode } from '../../lib/types'

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

  // Encapsulated Sandbox Poller hook
  useProvisioningSandbox({
    active: provisioning,
    pollFn: pollSandbox,
    onCapture: async (captured) => {
      showSuccess('Session captured! Saving profile…')
      await finishSandbox()
      onCloseAddModal()
      showSuccess('Account saved successfully!')
      await loadAccounts()
    },
    onError: (err) => showError(err.message),
  })

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
    showSuccess('Injecting session and booting League of Legends…')
    try {
      await launchAccount(id)
      showSuccess('League of Legends launched!')
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleCaptureActive = async (name: string, region: string) => {
    setBusy(true)
    showSuccess('Inspecting local Riot settings…')
    try {
      const sessionBlob = await captureActive()
      if (!sessionBlob) {
        throw new Error('No active login session detected in Riot Client.')
      }
      await saveAccount(name, region, sessionBlob)
      onCloseAddModal()
      showSuccess(`Account "${name}" registered successfully!`)
      await loadAccounts()
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleStartSandbox = async (_name: string, _region: string) => {
    setBusy(true)
    showSuccess('Opening Riot Client in isolated sandbox…')
    try {
      await startSandbox()
      showSuccess('Sandbox ready! Please sign in with "Stay signed in" enabled.')
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
      showSuccess(`Profile "${deleteTarget.name}" deleted.`)
      setDeleteTarget(null)
      await loadAccounts()
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handlePush = async (localId: string) => {
    if (!isAdmin || !onPushToCloud) return
    setBusy(true)
    showSuccess('Publishing account to Shared Pool…')
    try {
      const full = await getFullAccount(localId)
      if (!full || !full.session_blob) {
        throw new Error('No valid session stored in this profile.')
      }
      await onPushToCloud(full.name, full.region, full.session_blob)
      showSuccess(`Account "${full.name}" published to Shared Pool!`)
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
          isCloud={false}
          searchActive={Boolean(searchQuery || selectedRegion !== 'ALL')}
          onAction={onOpenAddModal}
          onQuickImport={() => {
            void handleCaptureActive('Active Summoner', selectedRegion === 'ALL' ? 'EUW' : selectedRegion)
          }}
        />
      ) : (
        <AccountRosterDisplay
          items={filteredAccounts.map((acc) => ({
            id: acc.id,
            name: acc.name,
            region: acc.region,
            hasSession: true,
            lastUsedText: acc.last_used_at
              ? new Date(acc.last_used_at).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : null,
          }))}
          viewMode={viewMode}
          isCloud={false}
          canManage={true}
          busy={busy}
          onLaunch={handleLaunch}
          onPushToCloud={isAdmin && onPushToCloud ? handlePush : undefined}
          onDelete={(id, name) => setDeleteTarget({ id, name })}
        />
      )}

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={showAddModal}
        onClose={onCloseAddModal}
        onCaptureActive={handleCaptureActive}
        onStartSandbox={handleStartSandbox}
        onCancelSandbox={cancelSandbox}
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
