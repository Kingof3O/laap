import { ProfileAvatar } from './ProfileAvatar'
import { RankCrest } from './RankPicker'
import {
  Pencil,
  LogIn,
  KeyRound,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  UploadCloud,
  Zap,
} from 'lucide-react'
import { getRankTierClass, formatRelativeTime } from '../../lib/sorting'

export interface AccountCardProps {
  id: string
  name: string
  region: string
  rank?: string | null
  notes?: string
  iconAsset?: string | null
  lastUsedText?: string | null
  hasSession?: boolean
  status?: string
  isSelected?: boolean
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  clientRunning?: boolean
  launchStatus?: string | null
  isLaunching?: boolean
  launchFailed?: boolean
  onSelect?: () => void
  launchLabel?: string
  onEdit?: () => void
  onRefreshSession?: () => void
  onLaunch: () => void
  onRetry?: () => void
  onSync?: () => void
  onPushToCloud?: () => void
  onForceRelease?: () => void
  onRevokeSession?: () => void
  onDelete: () => void
}

export function AccountCard({
  name,
  region,
  rank,
  notes,
  iconAsset,
  lastUsedText,
  hasSession = true,
  status = 'Available',
  isSelected = false,
  isCloud = false,
  canManage = false,
  busy = false,
  clientRunning = false,
  launchStatus,
  isLaunching = false,
  launchFailed = false,
  onSelect,
  launchLabel = 'Play',
  onEdit,
  onRefreshSession,
  onLaunch,
  onRetry,
  onSync,
  onPushToCloud,
  onForceRelease,
  onRevokeSession,
  onDelete,
}: AccountCardProps) {
  const isLeased = isCloud && status === 'Leased'
  const sessionWarning =
    !isCloud && (status === 'Session stale' || status.includes('unknown'))

  return (
    <div
      className={`roster-card ${isSelected ? 'roster-card-selected' : ''}`}
      onClick={() => onSelect?.()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.()
        }
      }}
    >
      {/* Top Banner & Status */}
      <div className="card-top-row">
        <div className="card-identity">
          <div className="card-avatar">
            <ProfileAvatar name={name} asset={iconAsset} />
            <span className="avatar-region-pip">{region}</span>
          </div>

          <div className="card-info">
            <div className="card-title-row">
              <span className="card-name" title={name}>
                {name}
              </span>
            </div>
            <div className="card-meta">
              {rank ? (
                <span
                  className={`account-rank-label ${getRankTierClass(rank)}`}
                  title={`Rank: ${rank}`}
                >
                  <RankCrest rank={rank} /> {rank}
                </span>
              ) : null}
              {isLeased ? (
                <span className="status-indicator status-indicator-warn">
                  <span className="status-beacon status-beacon-amber" />
                  In Use
                </span>
              ) : hasSession ? (
                <span
                  className={`status-indicator ${sessionWarning ? 'status-indicator-warn' : 'status-indicator-ready'}`}
                >
                  <span
                    className={`status-beacon ${sessionWarning ? 'status-beacon-amber' : 'status-beacon-ready'}`}
                  />
                  {isCloud ? 'Ready' : status}
                </span>
              ) : (
                <span className="status-indicator status-indicator-warn">
                  <span className="status-beacon status-beacon-amber" />
                  {isCloud ? 'Needs Login' : status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Card Context Actions */}
        <div
          className="card-secondary-actions"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit ? (
            <button
              type="button"
              className="action-icon-btn"
              title="Edit Profile"
              aria-label={`Edit ${name}`}
              disabled={busy}
              onClick={onEdit}
            >
              <Pencil size={14} />
            </button>
          ) : null}
          {onRefreshSession ? (
            <button
              type="button"
              className="action-icon-btn"
              title="Sign in again"
              aria-label={`Sign in again to ${name}`}
              disabled={busy}
              onClick={onRefreshSession}
            >
              <LogIn size={14} />
            </button>
          ) : null}
          {canManage && isCloud && onSync ? (
            <button
              type="button"
              className="action-icon-btn"
              onClick={onSync}
              disabled={busy}
              title="Sync Login Session"
            >
              <Zap size={14} />
            </button>
          ) : null}

          {canManage && isCloud && hasSession && onRevokeSession ? (
            <button
              type="button"
              className="action-icon-btn"
              onClick={onRevokeSession}
              disabled={busy}
              title="Revoke Stored Login Session"
            >
              <KeyRound size={14} />
            </button>
          ) : null}

          {canManage && !isCloud && onPushToCloud ? (
            <button
              type="button"
              className="action-icon-btn"
              onClick={onPushToCloud}
              disabled={busy}
              title="Publish to Shared Accounts"
            >
              <UploadCloud size={14} />
            </button>
          ) : null}

          {canManage ? (
            <button
              type="button"
              className="action-icon-btn action-icon-btn-delete"
              onClick={onDelete}
              disabled={busy}
              title="Remove Account"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {notes ? <p className="account-notes card-notes">{notes}</p> : null}

      {/* Primary Action Row */}
      <div className="card-bottom-row" onClick={(e) => e.stopPropagation()}>
        <span className="last-played-text" title={lastUsedText || undefined}>
          {formatRelativeTime(lastUsedText)}
        </span>
        {isLeased ? (
          canManage && onForceRelease ? (
            <button
              type="button"
              className="btn-launch-primary"
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                borderColor: 'rgba(239, 68, 68, 0.4)',
                color: '#fca5a5',
              }}
              onClick={onForceRelease}
              disabled={busy}
              title="Force release active session"
            >
              <RotateCcw size={13} />
              <span>Force Release</span>
            </button>
          ) : (
            <button type="button" className="btn-launch-primary" disabled>
              <span>In Use</span>
            </button>
          )
        ) : isLaunching ? (
          <button type="button" className="btn-launch-primary" disabled>
            <Loader2 size={13} className="animate-spin" />
            <span>{launchStatus ? 'Waiting for client…' : 'Preparing…'}</span>
          </button>
        ) : clientRunning ? (
          <button type="button" className="btn-launch-primary" disabled>
            Client running
          </button>
        ) : launchFailed ? (
          <button
            type="button"
            className="btn-launch-primary"
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
            }}
            onClick={onRetry ?? onLaunch}
            disabled={busy}
          >
            <RotateCcw size={13} />
            <span>Couldn&apos;t launch · Retry</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-launch-primary"
            onClick={
              !hasSession && onRefreshSession ? onRefreshSession : onLaunch
            }
            disabled={busy}
          >
            <Play size={13} fill="currentColor" />
            <span>
              {!hasSession && onRefreshSession ? 'Sign in again' : launchLabel}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
