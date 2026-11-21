import { useEffect, useState } from 'react'
import {
  EmptyState,
  AccountRosterDisplay,
  DeleteConfirmModal,
  LiveMatchWarningModal,
} from '../../shared/ui'
import { AccountLoadState } from '../../shared/ui/AccountLoadState'
import { EditAccountModal } from '../../shared/ui/EditAccountModal'
import { AddAccountModal } from './AddAccountModal'
import { useLocalAccounts } from './useLocalAccounts'
import { useProvisioningSandbox } from '../../shared/hooks/useProvisioningSandbox'
import { useToast } from '../../context/ToastContext'
import { useGame } from '../../context/GameContext'
import { useRiotOperations } from '../../context/RiotOperations'
import { invokeTauri } from '../../lib/api'
import type { SortOrder } from '../../lib/sorting'
import { getOpggCachedAvatar, getOpggCachedStats } from '../../lib/opgg'
import { ProfileSlotPicker, ReplaceActiveProfile } from '../billing/ProfileSlotPicker'
import type { ProfileSlots } from '../billing/useBilling'
import type {
  CapturedProfile,
  Game,
  LocalAccountSummary,
  ProfileDetails,
  Region,
  ViewMode,
} from '../../lib/types'
import {
  useAccountLaunch,
  useAutoRankSync,
  useRosterFilters,
  useRosterLiveStatus,
} from './hooks/index.ts'
import { SyncStatusWidget } from './components/SyncStatusWidget.tsx'
import { RosterWorkspaceSkeleton, ContentReveal } from '../../shared/ui/skeleton/index.ts'

interface Props {
  activeGame?: Game
  onGameChange?: (game: Game) => void
  trayRequest?: { id: string; sequence: number } | null
  onTrayRequestHandled?: () => void
  searchQuery: string
  selectedRegion: Region
  selectedRank: string
  onRankOptionsChange: (ranks: string[]) => void
  sortOrder: SortOrder
  onSortChange?: (order: SortOrder) => void
  favoritesOnly?: boolean
  onFavoritesOnlyChange?: (favOnly: boolean) => void
  onFavoriteCountChange?: (count: number) => void
  viewMode: ViewMode
  showAddModal: boolean
  onCloseAddModal: () => void
  onOpenAddModal: () => void
  onCountChange?: (count: number) => void
  onSlotsChange?: (slots: ProfileSlots | null) => void
}

export function PersonalRosterView({
  activeGame: propActiveGame,
  onGameChange,
  trayRequest,
  onTrayRequestHandled,
  searchQuery,
  selectedRegion,
  selectedRank,
  onRankOptionsChange,
  sortOrder,
  onSortChange,
  favoritesOnly = false,
  onFavoriteCountChange,
  viewMode,
  showAddModal,
  onCloseAddModal,
  onOpenAddModal,
  onCountChange,
  onSlotsChange,
}: Props) {
  const { showSuccess, showError } = useToast()
  const operations = useRiotOperations()
  const gameContext = useGame()
  const activeGame = propActiveGame ?? gameContext.activeGame
  const setActiveGame = onGameChange ?? gameContext.setActiveGame

  const [busy, setBusy] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [editTarget, setEditTarget] = useState<LocalAccountSummary | null>(null)
  const [refreshTarget, setRefreshTarget] = useState<LocalAccountSummary | null>(null)
  const [captured, setCaptured] = useState<CapturedProfile | null>(null)
  const [pending, setPending] = useState<ProfileDetails | null>(null)

  const {
    localAccounts,
    profileSlots,
    syncMessage,
    syncState,
    syncNow,
    lastSyncAt,
    lastSuccessfulSyncAt,
    syncEnabled,
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
  } = useLocalAccounts()

  useEffect(() => onSlotsChange?.(profileSlots), [onSlotsChange, profileSlots])

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
      if (!pending) throw new Error('Profile details are missing. Cancel and try again.')
      setBusy(true)
      try {
        await completeSandbox(pending, refreshTarget?.id)
        close()
        showSuccess(refreshTarget ? 'Saved login refreshed.' : 'Profile saved.')
        const profileGames: Game[] =
          pending.games && pending.games.length > 0 ? pending.games : ['league']
        if (!profileGames.includes(activeGame)) {
          const nextGame: Game = profileGames[0] ?? ('league' as Game)
          setActiveGame(nextGame)
          showSuccess(
            nextGame === 'valorant'
              ? 'Switched to VALORANT to show this profile.'
              : 'Switched to League to show this profile.',
          )
        }
      } finally {
        setBusy(false)
      }
    },
    onError: (err) => {
      setOperationError(err.message)
      showError(err.message)
    },
  })

  useEffect(() => {
    if (!modalOpen) void cancelSandbox().catch((cause) => showError(String(cause)))
  }, [modalOpen, cancelSandbox, showError])

  // Filter and sort accounts
  const { gameAccounts, filteredAccounts } = useRosterFilters({
    localAccounts,
    activeGame,
    searchQuery,
    selectedRegion,
    selectedRank,
    sortOrder,
    favoritesOnly,
    onRankOptionsChange,
    onFavoriteCountChange,
    onCountChange,
  })

  // Automatic OP.GG rank background sync
  useAutoRankSync(localAccounts, activeGame)

  // Live match tracking hook
  const { liveSettings, liveStatusById, applyLiveStatusResult, handleCheckLive } =
    useRosterLiveStatus(localAccounts, loadAccounts)

  // Account launch & preflight safety hook
  const {
    launchingId,
    failedLaunchId,
    activeLaunchId,
    liveWarning,
    setLiveWarning,
    handleLaunch,
  } = useAccountLaunch({
    localAccounts,
    activeGame,
    liveSettings,
    busy,
    setBusy,
    provisioning,
    trayRequest,
    loading,
    onTrayRequestHandled,
    setRefreshTarget,
    launchAccount,
    applyLiveStatusResult,
  })

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

  const confirmImport = async (details: ProfileDetails, session: CapturedProfile) => {
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
        details.riot_id ?? null,
        details.games,
        details.valorant_rank ?? null,
      )
      close()
      showSuccess('Profile saved.')
      const profileGames: Game[] =
        details.games && details.games.length > 0 ? details.games : ['league']
      if (!profileGames.includes(activeGame)) {
        const nextGame: Game = profileGames[0] ?? ('league' as Game)
        setActiveGame(nextGame)
        showSuccess(
          nextGame === 'valorant'
            ? 'Switched to VALORANT to show this profile.'
            : 'Switched to League to show this profile.',
        )
      }
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
      const selectedGame = details.games?.includes(activeGame)
        ? activeGame
        : details.games?.[0] ?? activeGame
      await startSandbox(refreshTarget?.id, selectedGame)
    } catch (cause) {
      showError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleToggleFavorite = async (id: string) => {
    const account = localAccounts.find((a) => a.id === id)
    if (!account) return
    setBusy(true)
    try {
      await editAccount(id, {
        name: account.name,
        region: account.region,
        rank: account.rank ?? null,
        notes: account.notes ?? '',
        favorite: !account.favorite,
        customization: account.customization,
      })
    } catch (cause) {
      showError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  const blocked = busy || capturing || operations.busy || provisioning

  const syncWidget = (
    <SyncStatusWidget
      syncEnabled={syncEnabled}
      syncState={syncState}
      syncMessage={syncMessage}
      lastSyncAt={lastSyncAt}
      lastSuccessfulSyncAt={lastSuccessfulSyncAt}
      blocked={blocked}
      onSyncNow={syncNow}
    />
  )

  const isInitialLoading = loading && localAccounts.length === 0 && !error
  const isError = Boolean(error && localAccounts.length === 0)
  const isGenuinelyEmpty = !loading && !error && localAccounts.length === 0
  const isFilteredEmpty = !loading && !error && localAccounts.length > 0 && filteredAccounts.length === 0

  return (
    <div>
      {profileSlots && profileSlots.chooseCount > 0 && !error ? (
        <ProfileSlotPicker slots={profileSlots} onChange={loadAccounts} />
      ) : null}
      {profileSlots &&
      profileSlots.lockedCount > 0 &&
      profileSlots.chooseCount === 0 &&
      !error ? (
        <ReplaceActiveProfile
          slots={profileSlots}
          active={localAccounts}
          blocked={blocked}
          onChange={loadAccounts}
        />
      ) : null}
      {isError ? (
        <>
          {syncEnabled ? (
            <div className="roster-list-utility roster-list-utility-padded">{syncWidget}</div>
          ) : null}
          <AccountLoadState
            loading={false}
            error={error}
            onRetry={() => void loadAccounts()}
          />
        </>
      ) : isInitialLoading ? (
        <RosterWorkspaceSkeleton
          viewMode={viewMode}
          activeGame={activeGame}
          toolbarSlot={syncEnabled ? syncWidget : null}
        />
      ) : isGenuinelyEmpty ? (
        <>
          {syncEnabled ? (
            <div className="roster-list-utility roster-list-utility-padded">{syncWidget}</div>
          ) : null}
          <EmptyState
            hasAnyProfiles={false}
            activeGame={activeGame}
            onSwitchGame={(game) => setActiveGame(game)}
            onAction={onOpenAddModal}
            onQuickImport={() => void detect()}
          />
        </>
      ) : isFilteredEmpty ? (
        <>
          {syncEnabled ? (
            <div className="roster-list-utility roster-list-utility-padded">{syncWidget}</div>
          ) : null}
          <EmptyState
            searchActive={Boolean(
              searchQuery || selectedRegion !== 'ALL' || selectedRank !== 'all' || favoritesOnly,
            )}
            hasAnyProfiles={localAccounts.length > 0 && gameAccounts.length === 0}
            activeGame={activeGame}
            onSwitchGame={(game) => setActiveGame(game)}
            onAction={onOpenAddModal}
            onQuickImport={() => void detect()}
          />
        </>
      ) : (
        <ContentReveal active={!loading}>
        <AccountRosterDisplay
          toolbarSlot={syncEnabled ? syncWidget : null}
          items={filteredAccounts.map((acc) => {
            const targetRiotId = acc.riot_id ?? (acc.name.includes('#') ? acc.name : null)
            const cachedAvatar = getOpggCachedAvatar(
              targetRiotId || acc.name,
              acc.region,
              activeGame,
            )
            const seasonStats = getOpggCachedStats(
              targetRiotId || acc.name,
              acc.region,
              activeGame,
            )

            return {
              id: acc.id,
              name: acc.name,
              favorite: acc.favorite,
              region: acc.region,
              rank: acc.rank,
              level: seasonStats?.level,
              seasonStats,
              valorantRank: acc.valorant_rank,
              games: acc.games,
              riotId: targetRiotId,
              notes: acc.notes,
              iconAsset:
                activeGame === 'valorant'
                  ? cachedAvatar || acc.customization?.valorant_icon_asset
                  : acc.customization?.icon_asset || cachedAvatar,
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
              createdAt: acc.created_at,
              liveStatus: liveStatusById[acc.id] ?? null,
            }
          })}
          activeGame={activeGame}
          viewMode={viewMode}
          busy={blocked}
          launchingId={launchingId}
          launchStatus={operations.tracking ? operations.launchStatus : null}
          activeLaunchId={activeLaunchId}
          failedLaunchId={failedLaunchId}
          onLaunch={(id, game) => void handleLaunch(id, game ?? activeGame)}
          onCheckLive={
            activeGame === 'league' && liveSettings?.mode && liveSettings.mode !== 'off'
              ? (id) => void handleCheckLive(id)
              : undefined
          }
          showLiveMenuAction={Boolean(
            activeGame === 'league' && liveSettings?.mode && liveSettings.mode !== 'off',
          )}
          launchLabel={operations.running ? 'Switch' : 'Play'}
          onEdit={(id) => setEditTarget(localAccounts.find((a) => a.id === id) ?? null)}
          onRefreshSession={(id) => {
            setCaptured(null)
            setRefreshTarget(localAccounts.find((a) => a.id === id) ?? null)
          }}
          onDelete={(id, name) => setDeleteTarget({ id, name })}
          onToggleFavorite={handleToggleFavorite}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
        />
        </ContentReveal>
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
      <LiveMatchWarningModal
        target={liveWarning}
        busy={busy || operations.busy}
        onClose={() => setLiveWarning(null)}
        onConfirm={() => {
          const targetId = liveWarning?.accountId
          setLiveWarning(null)
          if (targetId) void handleLaunch(targetId, activeGame, true)
        }}
      />
    </div>
  )
}
