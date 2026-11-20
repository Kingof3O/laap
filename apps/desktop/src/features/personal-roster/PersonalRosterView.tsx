import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EmptyState,
  AccountRosterDisplay,
  DeleteConfirmModal,
  LiveMatchWarningModal,
} from '../../shared/ui'
import type { LiveMatchWarningTarget } from '../../shared/ui/LiveMatchWarningModal'
import { AccountLoadState } from '../../shared/ui/AccountLoadState'
import { EditAccountModal } from '../../shared/ui/EditAccountModal'
import { AddAccountModal } from './AddAccountModal'
import { useLocalAccounts } from './useLocalAccounts'
import { useProvisioningSandbox } from '../../shared/hooks/useProvisioningSandbox'
import { useToast } from '../../context/ToastContext'
import { useGame } from '../../context/GameContext'
import { useRiotOperations } from '../../context/RiotOperations'
import { hasTauri, invokeTauri } from '../../lib/api'
import { formatLiveMinutes, formatLiveMode } from '../../lib/liveStatus'
import { sortProfiles, type SortOrder } from '../../lib/sorting'
import { getOpggCachedAvatar, getOpggCachedRank, getOpggCachedStats, getOpggSummonerUrl, autoSyncAccountRank } from '../../lib/opgg'
import { ProfileSlotPicker, ReplaceActiveProfile } from '../billing/ProfileSlotPicker'
import type { ProfileSlots } from '../billing/useBilling'
import type {
  CapturedProfile,
  Game,
  LiveMatchStatus,
  LiveStatusBadge,
  LiveStatusSettings,
  LocalAccountSummary,
  ProfileDetails,
  Region,
  ViewMode,
} from '../../lib/types'
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
  onFavoritesOnlyChange,
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
  const [launchScope, activeProfileId, launchGame = 'league'] = operations.activeLaunchKey?.split(':') ?? []
  const activeLaunchId = launchScope === 'local' && launchGame === activeGame ? activeProfileId : null
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
  const [liveSettings, setLiveSettings] = useState<LiveStatusSettings | null>(null)
  const [liveStatusById, setLiveStatusById] = useState<
    Record<string, LiveStatusBadge>
  >({})
  const [liveWarning, setLiveWarning] = useState<LiveMatchWarningTarget | null>(
    null,
  )
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
      if (!pending)
        throw new Error('Profile details are missing. Cancel and try again.')
      setBusy(true)
      try {
        await completeSandbox(pending, refreshTarget?.id)
        close()
        showSuccess(refreshTarget ? 'Saved login refreshed.' : 'Profile saved.')
        const profileGames: Game[] =
          pending.games && pending.games.length > 0
            ? pending.games
            : ['league']
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
  // Also covers a parent-driven close, not just the dialog's close button.
  useEffect(() => {
    if (!modalOpen)
      void cancelSandbox().catch((cause) => showError(String(cause)))
  }, [modalOpen, cancelSandbox])
  const [opggRevision, setOpggRevision] = useState(0)
  useEffect(() => {
    const update = () => setOpggRevision((revision) => revision + 1)
    window.addEventListener('laap:opgg-updated', update)
    return () => window.removeEventListener('laap:opgg-updated', update)
  }, [])
  const gameAccounts = useMemo(
    () => localAccounts
      .filter((account) => (account.games ?? ['league']).includes(activeGame))
      .map((account) => {
        const rawRank = activeGame === 'valorant' ? account.valorant_rank : account.rank
        const riotId = account.riot_id || account.name
        const effectiveRank = rawRank?.trim() && rawRank.trim().toLowerCase() !== 'unranked'
          ? rawRank
          : getOpggCachedRank(riotId, account.region, activeGame) ?? rawRank
        return {
          ...account,
          effectiveRank,
          rank: activeGame === 'league' ? effectiveRank : account.rank,
          valorant_rank: activeGame === 'valorant' ? effectiveRank : account.valorant_rank,
        }
      }),
    [localAccounts, activeGame, opggRevision],
  )
  const rankOptions = useMemo(
    () =>
      [
        ...new Map(
          gameAccounts
            .flatMap((a) => {
              const r = a.effectiveRank
              return r?.trim()
                ? [[r.trim().toLowerCase(), r.trim()] as const]
                : []
            }),
        ).values(),
      ].sort((a, b) => a.localeCompare(b)),
    [gameAccounts],
  )
  useEffect(
    () => onRankOptionsChange(rankOptions),
    [rankOptions, onRankOptionsChange],
  )
  useEffect(() => {
    const favCount = gameAccounts.filter((a) => a.favorite).length
    onFavoriteCountChange?.(favCount)
  }, [gameAccounts, onFavoriteCountChange])
  const filteredAccounts = useMemo(
    () =>
      sortProfiles(
        gameAccounts.filter((acc) => {
          if (favoritesOnly && !acc.favorite) return false
          const rank = acc.effectiveRank?.trim().toLowerCase() ?? ''
          return (
            (selectedRegion === 'ALL' ||
              acc.region.toUpperCase() === selectedRegion) &&
            (selectedRank === 'all' ||
              (selectedRank === 'unlabeled'
                ? !rank
                : selectedRank === `rank:${rank}`)) &&
            `${acc.name} ${acc.region} ${rank} ${acc.notes ?? ''}`
              .toLowerCase()
              .includes(searchQuery.trim().toLowerCase())
          )
        }),
        sortOrder,
        { activeGame },
      ),
    [gameAccounts, activeGame, selectedRegion, selectedRank, searchQuery, sortOrder, favoritesOnly],
  )
  const autoSyncedAccountsRef = useRef(new Map<string, string>())
  useEffect(() => {
    for (const acc of localAccounts) {
      if ((acc.games ?? ['league']).includes(activeGame)) {
        const targetRiotId = acc.riot_id || acc.name
        const info = getOpggSummonerUrl(acc.name, acc.region, targetRiotId, activeGame)
        const syncKey = `${acc.id}:${activeGame}`
        const syncTarget = JSON.stringify([info.url, acc.region, acc.customization?.auto_sync_valorant_rank])
        if (!info.hasTag) {
          autoSyncedAccountsRef.current.delete(syncKey)
        } else if (autoSyncedAccountsRef.current.get(syncKey) !== syncTarget) {
          autoSyncedAccountsRef.current.set(syncKey, syncTarget)
          void autoSyncAccountRank(
            {
              id: acc.id,
              name: acc.name,
              region: acc.region,
              rank: acc.rank,
              valorant_rank: acc.valorant_rank,
              riotId: targetRiotId,
            },
            activeGame,
          )
        }
      }
    }
  }, [localAccounts, activeGame])
  useEffect(() => {
    if (!hasTauri) return
    let active = true
    invokeTauri<LiveStatusSettings | null>('get_live_status_settings')
      .then((res) => {
        if (active && res) setLiveSettings(res)
      })
      .catch(() => {})
    const onConfigUpdate = (event: Event) => {
      const detail = (event as CustomEvent<LiveStatusSettings>).detail
      if (detail) setLiveSettings(detail)
    }
    window.addEventListener('laap:live-status-config', onConfigUpdate)
    return () => {
      active = false
      window.removeEventListener('laap:live-status-config', onConfigUpdate)
    }
  }, [])
  useEffect(
    () => onCountChange?.(filteredAccounts.length),
    [filteredAccounts.length, onCountChange],
  )
  const applyLiveStatusResult = (
    account: LocalAccountSummary,
    res: LiveMatchStatus,
  ) => {
    setLiveStatusById((prev) => ({
      ...prev,
      [account.id]: {
        checking: false,
        inGame: res.inGame,
        gameMode: res.gameMode,
        gameLengthSeconds: res.gameLengthSeconds,
        checkedAt: res.checkedAt,
      },
    }))
    if (!account.has_puuid && res.puuid) {
      void loadAccounts()
    }
  }
  const handleCheckLive = async (id: string) => {
    const account = localAccounts.find((a) => a.id === id)
    if (!account) return
    setLiveStatusById((prev) => ({
      ...prev,
      [id]: { ...prev[id], checking: true },
    }))
    try {
      const res = await invokeTauri<LiveMatchStatus>(
        'check_account_live_status',
        {
          accountId: account.id,
          region: account.region,
          name: account.name,
          bypassCache: true,
        },
      )
      if (!res.configured) {
        setLiveStatusById((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        showError(
          'Live match tracking is Off — enable Personal Key or Cloudflare Worker in Settings → Advanced first.',
        )
        return
      }
      applyLiveStatusResult(account, res)
      showSuccess(
        res.inGame
          ? `${account.name} is currently in a match (${formatLiveMode(res.gameMode)}).`
          : `${account.name} is not in a game.`,
      )
    } catch (cause) {
      setLiveStatusById((prev) => {
        const current = prev[id]
        if (!current) return prev
        const next = { ...prev }
        if (typeof current.inGame === 'boolean') {
          next[id] = { ...current, checking: false }
        } else {
          delete next[id]
        }
        return next
      })
      showError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const handleLaunch = async (id: string, game: Game = activeGame, skipLiveCheck = false) => {
    const account = localAccounts.find((a) => a.id === id)
    setBusy(true)
    setLaunchingId(id)
    setFailedLaunchId(null)
    try {
      if (
        !skipLiveCheck &&
        game === 'league' &&
        account &&
        liveSettings?.mode &&
        liveSettings.mode !== 'off' &&
        liveSettings.prelaunchGuard &&
        (account.has_puuid || account.name.includes('#'))
      ) {
        try {
          const res = await invokeTauri<LiveMatchStatus>(
            'check_account_live_status',
            {
              accountId: account.id,
              region: account.region,
              name: account.name,
              bypassCache: false,
            },
          )
          if (res.configured) {
            applyLiveStatusResult(account, res)
            if (res.inGame) {
              setLiveWarning({
                accountId: account.id,
                name: account.name,
                gameMode: res.gameMode,
                elapsedMinutes: formatLiveMinutes(res.gameLengthSeconds),
              })
              return
            }
          }
        } catch (cause) {
          showError(
            `Live match check skipped: ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
      }
      await launchAccount(id, game)
    } catch (cause) {
      setFailedLaunchId(id)
      showError(String(cause))
    } finally {
      setBusy(false)
      setLaunchingId(null)
    }
  }
  useEffect(() => {
    if (!trayRequest || loading) return
    onTrayRequestHandled?.()
    const account = localAccounts.find(
      (account) => account.id === trayRequest.id,
    )
    if (!account) {
      showError('That profile no longer exists. Refresh the roster.')
      return
    }
    if (!(account.games ?? ['league']).includes(activeGame)) {
      showError('That profile is unavailable for the selected game.')
      return
    }
    if (busy || operations.busy || provisioning) {
      showError('Please wait for the current Riot operation.')
      return
    }
    if (!account.has_session) {
      void invokeTauri('show_launcher').catch(() => {})
      setRefreshTarget(account)
      return
    }
    void handleLaunch(account.id, activeGame)
  }, [trayRequest, loading, activeGame])
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
        details.riot_id ?? null,
        details.games,
        details.valorant_rank ?? null,
      )
      close()
      showSuccess('Profile saved.')
      const profileGames: Game[] =
        details.games && details.games.length > 0
          ? details.games
          : ['league']
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
  const syncWidget = syncEnabled ? (
    <details className={`sync-compact sync-status-${syncState}`}>
      <summary>
        <RefreshCw size={15} /> <span>Icon &amp; rank sync</span>
        <span className="sync-compact-state">
          {syncState === 'syncing'
            ? 'Syncing…'
            : syncState === 'error'
              ? 'Needs attention'
              : syncState === 'waiting'
                ? 'Waiting'
                : syncState === 'success'
                  ? 'Up to date'
                  : 'Enabled'}
        </span>
      </summary>
      <div className="sync-compact-panel">
        <p role="status">
          {syncMessage ??
            'Checks enabled profile options when League Client is available.'}
        </p>
        {lastSyncAt ? (
          <small>
            Last checked: {lastSyncAt.toLocaleTimeString()}
            {lastSuccessfulSyncAt
              ? ` · Last successful: ${lastSuccessfulSyncAt.toLocaleTimeString()}`
              : ''}
          </small>
        ) : null}
        <button
          type="button"
          className="btn-secondary"
          disabled={syncState === 'syncing' || blocked}
          onClick={() => void syncNow()}
        >
          {syncState === 'syncing'
            ? 'Syncing…'
            : syncState === 'error'
              ? 'Retry sync'
              : 'Sync now'}
        </button>
      </div>
    </details>
  ) : null
  return (
    <div>
      {profileSlots && profileSlots.chooseCount > 0 && !error
        ? <ProfileSlotPicker slots={profileSlots} onChange={loadAccounts} />
        : null}
      {profileSlots && profileSlots.lockedCount > 0 && profileSlots.chooseCount === 0 && !error
        ? <ReplaceActiveProfile slots={profileSlots} active={localAccounts} blocked={blocked} onChange={loadAccounts} />
        : null}
      {(loading && localAccounts.length === 0) || error ? (
        <>
          {syncWidget ? <div className="roster-list-utility roster-list-utility-padded">{syncWidget}</div> : null}
          <AccountLoadState
            loading={loading}
            error={error}
            onRetry={() => void loadAccounts()}
          />
        </>
      ) : filteredAccounts.length === 0 ? (
        <>
          {syncWidget ? <div className="roster-list-utility roster-list-utility-padded">{syncWidget}</div> : null}
          {(!profileSlots?.chooseCount || localAccounts.length > 0) && (
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
          )}
        </>
      ) : (
        <AccountRosterDisplay
          toolbarSlot={syncWidget}
          items={filteredAccounts.map((acc) => {
            const targetRiotId = acc.riot_id ?? (acc.name.includes('#') ? acc.name : null)
            const cachedAvatar = getOpggCachedAvatar(targetRiotId || acc.name, acc.region, activeGame)
            const seasonStats = getOpggCachedStats(targetRiotId || acc.name, acc.region, activeGame)

            return {
              id: acc.id,
              name: acc.name,
              favorite: acc.favorite,
              region: acc.region,
              rank: acc.rank,
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
          showLiveMenuAction={Boolean(activeGame === 'league' && liveSettings?.mode && liveSettings.mode !== 'off')}
          launchLabel={operations.running ? 'Switch' : 'Play'}
          onEdit={(id) =>
            setEditTarget(localAccounts.find((a) => a.id === id) ?? null)
          }
          onRefreshSession={(id) => {
            setCaptured(null)
            setRefreshTarget(localAccounts.find((a) => a.id === id) ?? null)
          }}
          onDelete={(id, name) => setDeleteTarget({ id, name })}
          onToggleFavorite={handleToggleFavorite}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
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
