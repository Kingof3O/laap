import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  Check,
  Clock3,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Loader2,
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
import { formatLiveMatchLabel } from '../../lib/liveStatus'
import { invokeTauri, isTauriAvailable, openExternalUrl } from '../../lib/api'
import {
  autoSyncAccountRank,
  fetchOpggStats,
  getOpggSummonerUrl,
  type OpggStats,
} from '../../lib/opgg'

export function ProfileInspector({
  account,
  busy,
  onClose,
  onEdit,
  onLaunch,
  onCheckLive,
  launchLabel = 'Launch',
  actions,
}: {
  account: RosterItem
  busy: boolean
  onClose: () => void
  onEdit?: () => void
  onLaunch?: () => void
  onCheckLive?: () => void
  launchLabel?: string
  actions?: ReactNode
}) {
  const added =
    account.createdAt && Number.isFinite(Date.parse(account.createdAt))
      ? new Date(account.createdAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null
  const sessionReady = account.hasSession && account.status !== 'Leased'

  const [stats, setStats] = useState<OpggStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [isEditingRiotId, setIsEditingRiotId] = useState(false)
  const [riotIdInput, setRiotIdInput] = useState('')
  const [savingRiotId, setSavingRiotId] = useState(false)

  const opggInfo = useMemo(
    () => getOpggSummonerUrl(account.name, account.region, account.riotId),
    [account.name, account.region, account.riotId],
  )

  const loadStats = useCallback(
    async (forceRefresh = false) => {
      // If no # tag and no linked riot ID, don't query a dummy nonexistent summoner
      if (!opggInfo.hasTag && !account.riotId) {
        setStats(null)
        setStatsError(null)
        setStatsLoading(false)
        return
      }

      setStatsLoading(true)
      setStatsError(null)
      try {
        const res = await fetchOpggStats(
          account.name,
          account.region,
          account.riotId,
          forceRefresh,
        )
        setStats(res)
        if (
          res?.formattedRank &&
          res.formattedRank !== 'Unranked' &&
          res.formattedRank !== account.rank
        ) {
          void autoSyncAccountRank(account)
        }
      } catch (err: unknown) {
        setStats(null)
        setStatsError(err instanceof Error ? err.message : String(err))
      } finally {
        setStatsLoading(false)
      }
    },
    [account, opggInfo.hasTag],
  )

  useEffect(() => {
    setIsEditingRiotId(false)
    setRiotIdInput(account.riotId || (account.name.includes('#') ? account.name : ''))
    void loadStats(false)
  }, [account.id, account.name, account.region, account.riotId, loadStats])
  return (
    <aside
      id="profile-inspector"
      className="profile-inspector"
      aria-label="Selected profile details"
    >
      <div className="inspector-top">
        <div>
          <span className="inspector-eyebrow">SELECTED ACCOUNT</span>
          <h2>Account details</h2>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Hide account details"
        >
          <X size={18} />
        </button>
      </div>
      <div className="inspector-profile">
        <div className="inspector-avatar">
          <ProfileAvatar name={account.name} asset={account.iconAsset} />
        </div>
        <div className="inspector-identity-copy">
          <strong title={account.name}>{account.name}</strong>
          <span className="inspector-subtitle">
            <span className="inspector-region-pill">{account.region}</span>
            {account.rank ? (
              <span className="inspector-rank-inline">
                <RankCrest rank={account.rank} />
                {account.rank}
              </span>
            ) : (
              <span>Unranked</span>
            )}
          </span>
        </div>
      </div>
      <dl className="inspector-details">
        <div>
          <dt>
            <ShieldCheck size={15} /> Session
          </dt>
          <dd>
            {account.status ||
              (account.hasSession ? 'Login saved' : 'Sign in required')}
          </dd>
        </div>
        <div>
          <dt>
            <Clock3 size={15} /> Last played
          </dt>
          <dd>{account.lastUsedText || 'Never played'}</dd>
        </div>
        {added ? (
          <div>
            <dt>
              <Clock3 size={15} /> Profile added
            </dt>
            <dd>{added}</dd>
          </div>
        ) : null}
        {onCheckLive || account.liveStatus ? (
          <div>
            <dt>
              <Activity size={15} /> Live match
            </dt>
            <dd
              className={
                account.liveStatus?.inGame
                  ? 'inspector-live-in-game'
                  : account.liveStatus && !account.liveStatus.checking
                    ? 'inspector-live-idle'
                    : undefined
              }
            >
              {formatLiveMatchLabel(account.liveStatus)}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="inspector-season-stats">
        <div className="inspector-stats-header">
          <span className="inspector-label">
            <Trophy size={14} /> Season Stats
          </span>
          <div className="inspector-stats-header-actions">
            <button
              type="button"
              className="btn-stats-refresh"
              onClick={() => void loadStats(true)}
              disabled={statsLoading || (!opggInfo.hasTag && !account.riotId)}
              title="Refresh season stats from OP.GG"
              aria-label="Refresh season stats"
            >
              <RefreshCw size={12} className={statsLoading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="btn-opgg-view"
              onClick={() => void openExternalUrl(opggInfo.url)}
              aria-label={`View on OP.GG`}
              title={
                opggInfo.hasTag || account.riotId
                  ? `Open ${opggInfo.summonerName}#${opggInfo.tagLine} on OP.GG`
                  : 'Link a Riot ID to view OP.GG'
              }
              disabled={!opggInfo.hasTag && !account.riotId}
            >
              <Globe size={12} />
              <span>View on OP.GG</span>
              <ExternalLink size={10} />
            </button>
          </div>
        </div>
        <div className="inspector-stats-card">
          {isEditingRiotId ? (
            <form
              className="inspector-riot-id-form"
              onSubmit={async (e) => {
                e.preventDefault()
                const trimmed = riotIdInput.trim()
                if (!trimmed) return
                setSavingRiotId(true)
                try {
                  if (isTauriAvailable()) {
                    await invokeTauri('update_account_riot_id', {
                      id: account.id,
                      riotId: trimmed,
                    })
                  }
                  setIsEditingRiotId(false)
                  window.dispatchEvent(new Event('laap:refresh'))
                  void loadStats(true)
                } catch {
                  // Fall through
                } finally {
                  setSavingRiotId(false)
                }
              }}
            >
              <input
                type="text"
                className="hextech-input hextech-input-sm"
                placeholder="Riot ID (e.g. Kingof3O#EUW)"
                value={riotIdInput}
                onChange={(e) => setRiotIdInput(e.target.value)}
                autoFocus
                disabled={savingRiotId}
              />
              <div className="inspector-riot-id-form-actions">
                <button
                  type="submit"
                  className="btn-riot-id-save"
                  disabled={savingRiotId || !riotIdInput.trim()}
                  title="Save Riot ID"
                >
                  {savingRiotId ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Check size={12} />
                  )}
                </button>
                <button
                  type="button"
                  className="btn-riot-id-cancel"
                  onClick={() => setIsEditingRiotId(false)}
                  disabled={savingRiotId}
                  title="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            </form>
          ) : !opggInfo.hasTag && !account.riotId ? (
            <div className="inspector-unlinked-box">
              <span className="inspector-unlinked-label">
                No Riot ID linked
              </span>
              <button
                type="button"
                className="btn-link-riot-id"
                onClick={() => {
                  setRiotIdInput('')
                  setIsEditingRiotId(true)
                }}
              >
                <Link2 size={12} />
                <span>Link Riot ID</span>
              </button>
            </div>
          ) : statsLoading ? (
            <div className="inspector-stats-loading-box">
              <span className="inspector-winrate-label">Win Rate:</span>
              <span className="stats-pulse">Syncing OP.GG…</span>
            </div>
          ) : stats ? (
            <div className="inspector-stats-content">
              <div className="inspector-stats-row">
                <span className="inspector-winrate-label">Win Rate:</span>
                <strong className="inspector-winrate-value">
                  {stats.formattedWinRate ||
                    `${stats.wins}W - ${stats.losses}L (${stats.winRate}%)`}
                </strong>
              </div>
              <div className="inspector-stats-riot-id-row">
                <span className="inspector-stats-riot-tag">
                  {opggInfo.summonerName}#{opggInfo.tagLine}
                </span>
                <button
                  type="button"
                  className="btn-riot-id-edit"
                  onClick={() => {
                    setRiotIdInput(
                      account.riotId ||
                        (account.name.includes('#') ? account.name : ''),
                    )
                    setIsEditingRiotId(true)
                  }}
                  title="Change linked Riot ID"
                >
                  Edit
                </button>
              </div>
            </div>
          ) : (
            <div className="inspector-stats-error-box">
              <span className="inspector-winrate-label">Win Rate:</span>
              <span className="inspector-stats-notfound">
                {statsError?.toLowerCase().includes('not found')
                  ? 'Not found on OP.GG'
                  : 'Unavailable'}
              </span>
              <button
                type="button"
                className="btn-riot-id-edit-subtle"
                onClick={() => {
                  setRiotIdInput(
                    account.riotId ||
                      (account.name.includes('#') ? account.name : ''),
                  )
                  setIsEditingRiotId(true)
                }}
              >
                Check Riot ID
              </button>
            </div>
          )}
        </div>
      </div>
      {account.notes !== undefined ? (
        <div className="inspector-notes">
          <span className="inspector-label">
            <FileText size={14} /> Notes
          </span>
          <p>{account.notes || 'No notes added.'}</p>
        </div>
      ) : null}
      <div className="inspector-actions">
        {onLaunch && sessionReady ? (
          <button
            className="btn-modal-primary inspector-launch-btn"
            type="button"
            onClick={onLaunch}
            disabled={busy}
            aria-label={`Launch ${account.name}`}
          >
            <Play size={13} fill="currentColor" />
            <span>
              {launchLabel === 'Switch' ? 'Switch account' : 'Launch session'}
            </span>
          </button>
        ) : null}
        {onCheckLive ? (
          <button
            className="btn-live-check"
            type="button"
            onClick={onCheckLive}
            disabled={busy || account.liveStatus?.checking}
            aria-label={`Check live match status for ${account.name}`}
          >
            {account.liveStatus?.checking ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Activity size={13} />
            )}
            <span>
              {account.liveStatus?.checking ? 'Checking…' : 'Check live'}
            </span>
          </button>
        ) : null}
        {onEdit ? (
          <button
            className="inspector-edit"
            type="button"
            onClick={onEdit}
            disabled={busy}
          >
            <Settings2 size={15} /> Manage profile <span aria-hidden="true">↗</span>
          </button>
        ) : null}
      </div>
      {actions}
    </aside>
  )
}
