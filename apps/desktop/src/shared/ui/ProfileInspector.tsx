import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react'
import {
  Activity,
  Check,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react'
import type { RosterItem } from './AccountRosterDisplay'
import { ProfileAvatar } from './ProfileAvatar'
import { RankCrest } from './RankPicker'
import { SeasonRecord } from './SeasonRecord'
import { useGame } from '../../context/GameContext'
import type { Game } from '../../lib/types'
import { formatLiveMatchLabel } from '../../lib/liveStatus'
import { invokeTauri, isTauriAvailable, openExternalUrl } from '../../lib/api'
import {
  autoSyncAccountRank,
  fetchOpggStats,
  getOpggSummonerUrl,
  type OpggStats,
} from '../../lib/opgg'

export function InspectorIconButton({
  label,
  title = label,
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'className' | 'aria-label'> & { label: string }) {
  return <button {...props} className="inspector-icon-btn" type={type} aria-label={label} title={title} />
}

export function ProfileInspector({
  account,
  activeGame: propActiveGame,
  busy,
  onClose,
  onEdit,
  onLaunch,
  onCheckLive,
  launchLabel = 'Launch',
}: {
  account: RosterItem
  activeGame?: Game
  busy: boolean
  onClose: () => void
  onEdit?: () => void
  onLaunch?: () => void
  onCheckLive?: () => void
  launchLabel?: string
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
  const sessionReady = account.hasSession

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
  }, [name, riotId, loadStats])
  const opggRank = isVal ? stats?.formattedRank : undefined
  const rank = displayRank || opggRank || 'Unranked'
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

  return (
    <aside id="profile-inspector" className="profile-inspector" aria-label="Selected profile details">
      <header className="inspector-top">
        <h2>Account details</h2>
        <div className="inspector-icon-group">
          {onEdit ? (
            <InspectorIconButton label="Manage profile" onClick={onEdit} disabled={busy}>
              <Settings2 size={15} />
            </InspectorIconButton>
          ) : null}
          <InspectorIconButton label="Hide account details" onClick={onClose}>
            <X size={17} />
          </InspectorIconButton>
        </div>
      </header>

      <div className="inspector-profile">
        <div className="inspector-avatar">
          <ProfileAvatar
            name={name}
            asset={stats?.avatarUrl || account.iconAsset}
            activeGame={activeGame}
            avatarUrl={stats?.avatarUrl}
            riotId={riotId}
            region={region}
          />
        </div>
        <div className="inspector-identity-copy">
          <strong title={name}>{name}</strong>
          <div className="inspector-subtitle">
            <span className="inspector-region-pill">{region}</span>
            <span className={`game-badge ${isVal ? 'game-badge-valo' : 'game-badge-league'}`}>
              <img src={isVal ? '/valorant-icon.webp' : '/league-of-legends-icon.webp'} alt="" className="game-badge-icon" />
              {isVal ? 'VALORANT' : 'League'}
            </span>
          </div>
        </div>
      </div>

      <div className="inspector-rank">
        <div className="inspector-crest"><RankCrest rank={rank} game={activeGame} /></div>
        <div>
          <span className="inspector-meta-label">Rank</span>
          <strong>{rank}</strong>
        </div>
      </div>

      <div className="inspector-session">
        {(onLaunch && sessionReady) || canCheckLive ? (
          <div className="inspector-session-actions">
            {onLaunch && sessionReady ? (
              <button className="btn-modal-primary inspector-launch-btn" type="button" onClick={onLaunch}
                disabled={busy} aria-label={`Launch ${name}`}>
                <Play size={14} fill="currentColor" aria-hidden="true" />
                {launchLabel === 'Switch' ? 'Switch account' : 'Launch session'}
              </button>
            ) : null}
            {canCheckLive ? (
              <InspectorIconButton
                label={`Check live match status for ${name}`}
                title="Check live match"
                onClick={onCheckLive}
                disabled={busy || account.liveStatus?.checking}
              >
                {account.liveStatus?.checking ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
              </InspectorIconButton>
            ) : null}
          </div>
        ) : null}
        <div className={`inspector-session-status${sessionReady ? ' inspector-session-ready' : ''}`}>
          <ShieldCheck size={14} aria-hidden="true" />
          <span><span className="visually-hidden">Session </span>{sessionStatus}</span>
        </div>
      </div>

      <section className="inspector-section" aria-label="Season stats">
        <div className="inspector-section-heading">
          <h3><Trophy size={14} aria-hidden="true" /> Season stats</h3>
          <div className="inspector-icon-group">
            <InspectorIconButton
              label="Refresh season stats"
              title="Refresh season stats from OP.GG"
              onClick={async () => {
                const result = await loadStats(true)
                if (result) await autoSyncAccountRank(account, activeGame)
              }}
              disabled={statsLoading || !opggInfo.hasTag}
            >
              <RefreshCw size={14} className={statsLoading ? 'animate-spin' : ''} />
            </InspectorIconButton>
            <InspectorIconButton
              label="View on OP.GG"
              title={riotTag ? `Open ${riotTag} on OP.GG` : 'Link a Riot ID to view OP.GG'}
              onClick={() => void openExternalUrl(opggInfo.url)}
              disabled={!opggInfo.hasTag}
            >
              <ExternalLink size={14} />
            </InspectorIconButton>
          </div>
        </div>
        <div className="inspector-stats-card">
          {statsLoading ? (
            <p className="inspector-stat-message" role="status">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Fetching {isVal ? 'VALORANT' : 'League'} stats…
            </p>
          ) : stats ? (
            isVal ? (
              <dl className="inspector-season-metrics">
                {showOpggRank ? (
                  <div><dt>OP.GG rank</dt><dd>{opggRank}</dd></div>
                ) : null}
                {typeof level === 'number' ? (
                  <div><dt>Account level</dt><dd>{level}</dd></div>
                ) : !showOpggRank ? (
                  <div><dt>Competitive rank</dt><dd>{rank}</dd></div>
                ) : null}
              </dl>
            ) : (
              <SeasonRecord
                wins={stats.wins}
                losses={stats.losses}
                fallback={<p className="inspector-stat-message">{stats.formattedWinRate || 'No ranked games'}</p>}
              />
            )
          ) : riotTag && !isEditingRiotId ? (
            <p className="inspector-stat-message" role="status">
              {statsError?.toLowerCase().includes('not found') ? 'Not found on OP.GG' : 'Season stats unavailable'}
            </p>
          ) : null}
          {isEditingRiotId ? (
            <form className="inspector-riot-id-form" onSubmit={async (event) => {
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
            }}>
              <div className="inspector-riot-id-input">
                <input
                  type="text"
                  className="hextech-input"
                  aria-label="Riot ID"
                  placeholder="Name#Tag"
                  value={riotIdInput}
                  onChange={(event) => setRiotIdInput(event.target.value)}
                  autoFocus
                  disabled={savingRiotId}
                />
                <InspectorIconButton label="Save Riot ID" type="submit"
                  disabled={savingRiotId || !riotIdInput.trim() || !getOpggSummonerUrl(name, region, riotIdInput, activeGame).hasTag}>
                  {savingRiotId ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                </InspectorIconButton>
                <InspectorIconButton label="Cancel Riot ID edit" onClick={() => setIsEditingRiotId(false)} disabled={savingRiotId}>
                  <X size={14} />
                </InspectorIconButton>
              </div>
              {riotIdError ? <p className="inspector-stat-error" role="alert">{riotIdError}</p> : null}
            </form>
          ) : (
            <div className="inspector-riot-id">
              <span title={riotTag ?? undefined}>{riotTag ?? 'No Riot ID linked'}</span>
              <InspectorIconButton label={riotTag ? 'Change linked Riot ID' : 'Link Riot ID'} onClick={startRiotIdEdit}>
                {riotTag ? <Pencil size={14} /> : <Link2 size={15} />}
              </InspectorIconButton>
            </div>
          )}
        </div>
      </section>

      <section className="inspector-section" aria-label="Activity">
        <div className="inspector-section-heading">
          <h3><Clock3 size={14} aria-hidden="true" /> Activity</h3>
        </div>
        <dl className="inspector-details">
          {!isVal && (canCheckLive || account.liveStatus) ? (
            <div>
              <dt>Live match</dt>
              <dd className={account.liveStatus?.inGame ? 'inspector-live-in-game' :
                account.liveStatus && !account.liveStatus.checking ? 'inspector-live-idle' : undefined}
                aria-live="polite">
                {formatLiveMatchLabel(account.liveStatus)}
              </dd>
            </div>
          ) : null}
          <div><dt>Last played</dt><dd>{account.lastUsedText || 'Never played'}</dd></div>
          {added ? <div><dt>Profile added</dt><dd>{added}</dd></div> : null}
        </dl>
      </section>
      {account.notes !== undefined ? (
        <section className="inspector-section inspector-notes" aria-label="Notes">
          <div className="inspector-section-heading">
            <h3><FileText size={14} aria-hidden="true" /> Notes</h3>
          </div>
          <p>{account.notes || 'No notes added.'}</p>
        </section>
      ) : null}
    </aside>
  )
}
