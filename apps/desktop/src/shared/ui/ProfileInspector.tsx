import type { FormEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RosterItem } from './AccountRosterDisplay.tsx'
import type { Game } from '../../lib/types.ts'
import { useGame } from '../../context/GameContext.tsx'
import { invokeTauri, isTauriAvailable, openExternalUrl } from '../../lib/api.ts'
import {
  autoSyncAccountRank,
  fetchOpggStats,
  getOpggSummonerUrl,
  type OpggStats,
} from '../../lib/opgg.ts'
import {
  InspectorActivitySection,
  InspectorIconButton,
  InspectorIdentityHeader,
  InspectorNotesSection,
  InspectorRankCard,
  InspectorSeasonStats,
  TopHeroesStrip,
} from './inspector/index.ts'

export { InspectorIconButton, TopHeroesStrip }

export function ProfileInspector({
  account,
  activeGame: propActiveGame,
  isCloud = false,
  busy = false,
  onClose,
  onEdit,
  onLaunch,
  onCheckLive,
  launchLabel = 'Launch',
  actions,
}: {
  account: RosterItem
  activeGame?: Game
  isCloud?: boolean
  busy?: boolean
  onClose: () => void
  onEdit?: () => void
  onLaunch?: () => void
  onCheckLive?: () => void
  launchLabel?: string
  actions?: ReactNode
}) {
  let contextGame: Game = 'league'
  try {
    contextGame = useGame().activeGame
  } catch {
    // outside provider fallback
  }
  const activeGame = propActiveGame ?? contextGame
  const isVal = activeGame === 'valorant'
  const displayRank = isVal ? account.valorantRank : account.rank
  const { name, region, riotId } = account

  const added =
    account.createdAt && Number.isFinite(Date.parse(account.createdAt))
      ? new Date(account.createdAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null
  const sessionReady = Boolean(account.hasSession && account.status !== 'Leased')

  const [stats, setStats] = useState<OpggStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [isEditingRiotId, setIsEditingRiotId] = useState(false)
  const [riotIdInput, setRiotIdInput] = useState('')
  const [savingRiotId, setSavingRiotId] = useState(false)
  const [riotIdError, setRiotIdError] = useState<string | null>(null)

  const opggInfo = useMemo(
    () => getOpggSummonerUrl(name, region, riotId, activeGame),
    [name, region, riotId, activeGame],
  )

  const loadStats = useCallback(
    async (forceRefresh = false) => {
      if (!opggInfo.hasTag) {
        setStats(null)
        setStatsError(null)
        setStatsLoading(false)
        return
      }

      setStatsLoading(true)
      setStatsError(null)
      try {
        const res = await fetchOpggStats(
          name,
          region,
          riotId,
          forceRefresh,
          activeGame,
        )
        setStats(res)
        if (res?.avatarUrl) {
          window.dispatchEvent(new Event('laap:icons-updated'))
        }
        return res
      } catch (err: unknown) {
        setStats(null)
        setStatsError(err instanceof Error ? err.message : String(err))
      } finally {
        setStatsLoading(false)
      }
    },
    [name, region, riotId, opggInfo.hasTag, activeGame],
  )

  useEffect(() => {
    setIsEditingRiotId(false)
    setRiotIdInput(account.riotId || (account.name.includes('#') ? account.name : ''))
    void loadStats(false)
  }, [name, riotId, loadStats, account.riotId, account.name])

  const opggRank = isVal ? stats?.formattedRank : undefined
  const rank = displayRank || opggRank || 'Unranked'
  const displayRankWithScore = useMemo(() => {
    if (
      isVal &&
      typeof stats?.rr === 'number' &&
      !rank.toLowerCase().includes('unranked') &&
      !rank.includes('RR')
    ) {
      return `${rank} (${stats.rr} RR)`
    }
    return rank
  }, [isVal, rank, stats?.rr])

  const showOpggRank = Boolean(opggRank && opggRank !== rank)
  const level = stats?.level
  const sessionStatus = account.status || (account.hasSession ? 'Login saved' : 'Sign in required')
  const canCheckLive = !isVal && Boolean(onCheckLive)
  const riotTag = opggInfo.hasTag ? `${opggInfo.summonerName}#${opggInfo.tagLine}` : null

  const startRiotIdEdit = () => {
    setRiotIdInput(riotTag ?? '')
    setRiotIdError(null)
    setIsEditingRiotId(true)
  }

  const handleRiotIdSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = riotIdInput.trim()
    if (!trimmed || !getOpggSummonerUrl(name, region, trimmed, activeGame).hasTag) return
    setSavingRiotId(true)
    setRiotIdError(null)
    try {
      if (isTauriAvailable()) {
        await invokeTauri('update_account_riot_id', { id: account.id, riotId: trimmed })
      }
      setIsEditingRiotId(false)
      window.dispatchEvent(new Event('laap:refresh'))
    } catch (err) {
      setRiotIdError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingRiotId(false)
    }
  }

  return (
    <aside id="profile-inspector" className="profile-inspector" aria-label="Selected profile details">
      <InspectorIdentityHeader
        account={account}
        name={name}
        region={region}
        riotId={riotId}
        riotTag={riotTag}
        activeGame={activeGame}
        isVal={isVal}
        level={level}
        stats={stats}
        sessionStatus={sessionStatus}
        sessionReady={sessionReady}
        busy={busy}
        actions={actions}
        onEdit={onEdit}
        onClose={onClose}
        onEditRiotId={startRiotIdEdit}
      />

      <InspectorRankCard
        rank={rank}
        displayRankWithScore={displayRankWithScore}
        activeGame={activeGame}
        onLaunch={onLaunch}
        sessionReady={sessionReady}
        busy={busy}
        name={name}
        launchLabel={launchLabel}
        canCheckLive={canCheckLive}
        onCheckLive={onCheckLive}
        checkingLive={account.liveStatus?.checking}
      />

      <InspectorSeasonStats
        stats={stats}
        statsLoading={statsLoading}
        statsError={statsError}
        isVal={isVal}
        riotTag={riotTag}
        rank={rank}
        opggRank={opggRank}
        showOpggRank={showOpggRank}
        level={level}
        onRefresh={async () => {
          const result = await loadStats(true)
          if (result) {
            await autoSyncAccountRank(account, activeGame)
          }
        }}
        onOpenOpgg={() => void openExternalUrl(opggInfo.url)}
        canOpenOpgg={opggInfo.hasTag}
        isEditingRiotId={isEditingRiotId}
        riotIdInput={riotIdInput}
        savingRiotId={savingRiotId}
        riotIdError={riotIdError}
        onStartRiotIdEdit={startRiotIdEdit}
        onCancelRiotIdEdit={() => setIsEditingRiotId(false)}
        onChangeRiotIdInput={setRiotIdInput}
        onSubmitRiotId={handleRiotIdSubmit}
        hasValidInputTag={getOpggSummonerUrl(name, region, riotIdInput, activeGame).hasTag}
      />

      <InspectorActivitySection
        account={account}
        isVal={isVal}
        canCheckLive={canCheckLive}
        added={added}
      />

      <InspectorNotesSection notes={account.notes} />
    </aside>
  )
}
