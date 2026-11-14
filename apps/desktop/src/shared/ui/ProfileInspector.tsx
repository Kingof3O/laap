import type { ReactNode } from 'react'
import { Clock3, FileText, Play, Settings2, ShieldCheck, X } from 'lucide-react'
import type { RosterItem } from './AccountRosterDisplay'
import { ProfileAvatar } from './ProfileAvatar'
import { RankCrest } from './RankPicker'

export function ProfileInspector({
  account,
  busy,
  onClose,
  onEdit,
  onLaunch,
  launchLabel = 'Launch',
  actions,
}: {
  account: RosterItem
  busy: boolean
  onClose: () => void
  onEdit?: () => void
  onLaunch?: () => void
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
      </dl>
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
