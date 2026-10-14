import { useEffect, useMemo, useState } from 'react'
import {
  EmptyState,
  AccountRosterDisplay,
  DeleteConfirmModal,
} from '../../shared/ui'
import { AccountLoadState } from '../../shared/ui/AccountLoadState'
import { EditAccountModal } from '../../shared/ui/EditAccountModal'
import { AddAccountModal } from './AddAccountModal'
import { useLocalAccounts } from './useLocalAccounts'
import { useProvisioningSandbox } from '../../shared/hooks/useProvisioningSandbox'
import { useToast } from '../../context/ToastContext'
import { useRiotOperations } from '../../context/RiotOperations'
import { invokeTauri } from '../../lib/api'
import { sortProfiles, type SortOrder } from '../../lib/sorting'
import type {
  CapturedProfile,
  LocalAccountSummary,
  ProfileDetails,
  Region,
  ViewMode,
} from '../../lib/types'
interface Props {
  searchQuery: string
  selectedRegion: Region
  selectedRank: string
  onRankOptionsChange: (ranks: string[]) => void
  sortOrder: SortOrder
  viewMode: ViewMode
  isAdmin: boolean
  showAddModal: boolean
  onCloseAddModal: () => void
  onOpenAddModal: () => void
  onPushToCloud?: (
    name: string,
    region: string,
    sessionBlob: string,
  ) => Promise<void>
  onCountChange?: (count: number) => void
}
export function PersonalRosterView({
  searchQuery,
  selectedRegion,
  selectedRank,
  onRankOptionsChange,
  sortOrder,
  viewMode,
  isAdmin,
  showAddModal,
  onCloseAddModal,
  onOpenAddModal,
  onPushToCloud,
  onCountChange,
}: Props) {
  const { showSuccess, showError } = useToast()
  const operations = useRiotOperations()
  const [busy, setBusy] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)
  const [editTarget, setEditTarget] = useState<LocalAccountSummary | null>(null)
  const [refreshTarget, setRefreshTarget] =
    useState<LocalAccountSummary | null>(null)
  const [captured, setCaptured] = useState<CapturedProfile | null>(null)
  const [pending, setPending] = useState<ProfileDetails | null>(null)
  const [launchingId, setLaunchingId] = useState<string | null>(null),
    [failedLaunchId, setFailedLaunchId] = useState<string | null>(null)
  const {
    localAccounts,
    syncMessage,
    loading,
    error,
    loadAccounts,
    saveAccount,
    editAccount,
    deleteAccount,
    launchAccount,
    detectActive,
    startSandbox,
    cancelSandbox,
    pollSandbox,
    completeSandbox,
    provisioning,
    getFullAccount,
  } = useLocalAccounts()
  const modalOpen = showAddModal || !!refreshTarget
  const close = () => {
    onCloseAddModal()
    setRefreshTarget(null)
    setCaptured(null)
    setPending(null)
    setOperationError(null)
  }
  const { capturing } = useProvisioningSandbox({
    active: provisioning && modalOpen,
    pollFn: pollSandbox,
    onCapture: async () => {
      if (!pending)
        throw new Error('Profile details are missing. Cancel and try again.')
      setBusy(true)
      try {
        await completeSandbox(pending, refreshTarget?.id)
        close()
        showSuccess(refreshTarget ? 'Saved login refreshed.' : 'Profile saved.')
      } finally {
        setBusy(false)
      }
    },
    onError: (err) => {
      setOperationError(err.message)
      showError(err.message)
    },
  })
  // Also covers a parent-driven close, not just the dialog's close button.
  useEffect(() => {
    if (!modalOpen)
      void cancelSandbox().catch((cause) => showError(String(cause)))
  }, [modalOpen, cancelSandbox])
  const rankOptions = useMemo(
    () =>
      [
        ...new Map(
          localAccounts.flatMap((a) =>
            a.rank?.trim()
              ? [[a.rank.trim().toLowerCase(), a.rank.trim()] as const]
              : [],
          ),
        ).values(),
      ].sort((a, b) => a.localeCompare(b)),
    [localAccounts],
  )
  useEffect(
    () => onRankOptionsChange(rankOptions),
    [rankOptions, onRankOptionsChange],
  )
  const filteredAccounts = useMemo(
    () =>
      sortProfiles(
        localAccounts.filter((acc) => {
          const rank = acc.rank?.trim().toLowerCase() ?? ''
          return (
            (selectedRegion === 'ALL' ||
              acc.region.toUpperCase() === selectedRegion) &&
            (selectedRank === 'all' ||
              (selectedRank === 'unlabeled'
                ? !rank
                : selectedRank === `rank:${rank}`)) &&
            `${acc.name} ${acc.region} ${acc.rank ?? ''} ${acc.notes ?? ''}`
              .toLowerCase()
              .includes(searchQuery.trim().toLowerCase())
          )
        }),
        sortOrder,
      ),
    [localAccounts, selectedRegion, selectedRank, searchQuery, sortOrder],
  )
  useEffect(
    () => onCountChange?.(filteredAccounts.length),
    [filteredAccounts.length, onCountChange],
  )
  const handleLaunch = async (id: string) => {
    setBusy(true)
    setLaunchingId(id)
    setFailedLaunchId(null)
    try {
      await launchAccount(id)
    } catch (cause) {
      setFailedLaunchId(id)
      showError(String(cause))
    } finally {
      setBusy(false)
      setLaunchingId(null)
    }
  }
  const detect = async (details?: ProfileDetails) => {
    setBusy(true)
    try {
      const result = await detectActive()
      if (!result)
        throw new Error(
          'No saved Riot login found. Sign in with Stay signed in enabled, then import again.',
        )
      if (refreshTarget) {
        await invokeTauri('refresh_local_account', {
          id: refreshTarget.id,
          sessionBlob: result.session_blob,
        })
        await loadAccounts()
        close()
        showSuccess('Saved login refreshed.')
        return
      }
      setCaptured({
        ...result,
        details: {
          ...result.details,
          name: details?.name || result.details.name,
          region: details?.region || result.details.region,
        },
      })
      onOpenAddModal()
    } catch (cause) {
      showError(String(cause))
    } finally {
      setBusy(false)
    }
  }
  const confirmImport = async (
    details: ProfileDetails,
    session: CapturedProfile,
  ) => {
    setBusy(true)
    try {
      await saveAccount(
        details.name,
        details.region,
        session.session_blob,
        details.rank ?? '',
        details.notes,
        details.favorite,
        details.customization,
      )
      close()
      showSuccess('Profile saved.')
    } catch (cause) {
      showError(String(cause))
    } finally {
      setBusy(false)
    }
  }
  const start = async (details: ProfileDetails) => {
    setBusy(true)
    setPending(details)
    setOperationError(null)
    try {
      await startSandbox()
    } catch (cause) {
      showError(String(cause))
    } finally {
      setBusy(false)
    }
  }
  const push = async (id: string) => {
    if (!onPushToCloud) return
    setBusy(true)
    try {
      const full = await getFullAccount(id)
      await onPushToCloud(full.name, full.region, full.session_blob)
      showSuccess('Profile published.')
    } catch (cause) {
      showError(String(cause))
    } finally {
      setBusy(false)
    }
  }
  const blocked = busy || capturing || operations.busy || provisioning
  return (
    <div>
      {syncMessage ? (
        <p className="sync-status" role="status">
          {syncMessage}
        </p>
      ) : null}
      {loading || error ? (
        <AccountLoadState
          loading={loading}
          error={error}
          onRetry={() => void loadAccounts()}
        />
      ) : filteredAccounts.length === 0 ? (
        <EmptyState
          isCloud={false}
          searchActive={Boolean(
            searchQuery || selectedRegion !== 'ALL' || selectedRank !== 'all',
          )}
          onAction={onOpenAddModal}
          onQuickImport={() => void detect()}
        />
      ) : (
        <AccountRosterDisplay
          items={filteredAccounts.map((acc) => ({
            id: acc.id,
            name: `${acc.favorite ? '★ ' : ''}${acc.name}`,
            region: acc.region,
            rank: acc.rank,
            notes: acc.notes,
            iconAsset: acc.customization?.icon_asset,
            hasSession: acc.has_session,
            status:
              acc.session_status === 'missing'
                ? 'Sign in required'
                : acc.session_status === 'stale'
                  ? 'Session stale'
                  : acc.session_status === 'unknown'
                    ? 'Login saved · freshness unknown'
                    : 'Login saved',
            lastUsedText: acc.last_used_at
              ? new Date(acc.last_used_at).toLocaleString()
              : null,
            rawLastUsed: acc.last_used_at,
          }))}
          viewMode={viewMode}
          isCloud={false}
          canManage
          busy={blocked}
          launchingId={launchingId}
          failedLaunchId={failedLaunchId}
          onLaunch={handleLaunch}
          launchLabel={operations.running ? 'Switch' : 'Play'}
          onEdit={(id) =>
            setEditTarget(localAccounts.find((a) => a.id === id) ?? null)
          }
          onRefreshSession={(id) => {
            setCaptured(null)
            setRefreshTarget(localAccounts.find((a) => a.id === id) ?? null)
          }}
          onPushToCloud={isAdmin && onPushToCloud ? push : undefined}
          onDelete={(id, name) => setDeleteTarget({ id, name })}
        />
      )}
      {modalOpen ? (
        <AddAccountModal
          isOpen
          onClose={close}
          onCaptureActive={detect}
          onStartSandbox={start}
          onCancelSandbox={cancelSandbox}
          onConfirmImport={confirmImport}
          operationError={operationError}
          captured={captured}
          refreshTarget={refreshTarget}
          provisioning={provisioning}
          busy={busy || capturing}
        />
      ) : null}
      {editTarget ? (
        <EditAccountModal
          account={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(details) => editAccount(editTarget.id, details)}
        />
      ) : null}
      <DeleteConfirmModal
        target={deleteTarget}
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        busy={busy || operations.busy}
        onConfirm={async () => {
          if (!deleteTarget) return
          setBusy(true)
          try {
            await deleteAccount(deleteTarget.id)
            setDeleteTarget(null)
            showSuccess('Profile removed.')
          } catch (cause) {
            showError(String(cause))
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}
