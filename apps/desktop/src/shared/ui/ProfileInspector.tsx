import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  Clock3,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Play,
  Settings2,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react'
import type { RosterItem } from './AccountRosterDisplay'
import { ProfileAvatar } from './ProfileAvatar'
import { RankCrest } from './RankPicker'
import { formatLiveMatchLabel } from '../../lib/liveStatus'
import { openExternalUrl } from '../../lib/api'
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

  const opggInfo = useMemo(
    () => getOpggSummonerUrl(account.name, account.region),
    [account.name, account.region],
  )

  useEffect(() => {
    let cancelled = false
    setStatsLoading(true)
    fetchOpggStats(account.name, account.region)
      .then((res) => {
        if (!cancelled && res) {
          setStats(res)
          if (
            res.formattedRank &&
            res.formattedRank !== 'Unranked' &&
            res.formattedRank !== account.rank
          ) {
            void autoSyncAccountRank(account)
          }
        }
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [account.id, account.name, account.region, account.rank])
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
          <button
            type="button"
            className="btn-opgg-view"
            onClick={() => void openExternalUrl(opggInfo.url)}
            aria-label={`View ${account.name} on OP.GG`}
            title="Open OP.GG profile in browser"
          >
            <Globe size={12} />
            <span>View on OP.GG</span>
            <ExternalLink size={10} />
          </button>
        </div>
        <div className="inspector-stats-card">
          <span className="inspector-winrate-label">Win Rate:</span>
          <strong className="inspector-winrate-value">
            {statsLoading ? (
              <span className="stats-pulse">Syncing…</span>
            ) : stats ? (
              `${stats.wins}W - ${stats.losses}L (${stats.winRate}%)`
            ) : (
              '—'
            )}
          </strong>
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
