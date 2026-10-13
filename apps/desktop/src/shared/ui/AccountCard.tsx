import { KeyRound, Loader2, Play, RotateCcw, Trash2, UploadCloud, Zap } from 'lucide-react'

export interface AccountCardProps {
  id: string
  name: string
  region: string
  rank?: string | null
  lastUsedText?: string | null
  hasSession?: boolean
  status?: string
  isSelected?: boolean
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  isLaunching?: boolean
  launchFailed?: boolean
  onSelect?: () => void
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
  lastUsedText: _lastUsedText,
  hasSession = true,
  status = 'Available',
  isSelected = false,
  isCloud = false,
  canManage = false,
  busy = false,
  isLaunching = false,
  launchFailed = false,
  onSelect,
  onLaunch,
  onRetry,
  onSync,
  onPushToCloud,
  onForceRelease,
  onRevokeSession,
  onDelete,
}: AccountCardProps) {
  const initials = name.slice(0, 2).toUpperCase()
  const isLeased = isCloud && status === 'Leased'

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
            <span className="avatar-initials">{initials}</span>
            <span className="avatar-region-pip">{region}</span>
          </div>

          <div className="card-info">
            <div className="card-title-row">
              <span className="card-name" title={name}>{name}</span>
            </div>
            <div className="card-meta">
              {rank ? <span className="account-rank-label" title={`Rank: ${rank}`}>{rank}</span> : null}
              {isLeased ? (
                <span className="status-indicator status-indicator-warn">
                  <span className="status-beacon status-beacon-amber" />
                  In Use
                </span>
              ) : hasSession ? (
                <span className="status-indicator status-indicator-ready">
                  <span className="status-beacon status-beacon-ready" />
                  Ready
                </span>
              ) : (
                <span className="status-indicator status-indicator-warn">
                  <span className="status-beacon status-beacon-amber" />
                  Needs Login
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Card Context Actions */}
        <div className="card-secondary-actions" onClick={(e) => e.stopPropagation()}>
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

      {/* Primary Action Row */}
      <div className="card-bottom-row" onClick={(e) => e.stopPropagation()}>
        {isLeased ? (
          canManage && onForceRelease ? (
            <button
              type="button"
              className="btn-launch-primary"
              style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
              onClick={onForceRelease}
              disabled={busy}
              title="Force release active session"
            >
              <RotateCcw size={13} />
              <span>Force Release</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-launch-primary"
              disabled
            >
              <span>In Use</span>
            </button>
          )
        ) : isLaunching ? (
          <button
            type="button"
            className="btn-launch-primary"
            disabled
          >
            <Loader2 size={13} className="animate-spin" />
            <span>Preparing…</span>
          </button>
        ) : launchFailed ? (
          <button
            type="button"
            className="btn-launch-primary"
            style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
            onClick={onRetry ?? onLaunch}
            disabled={busy && !isLaunching}
          >
            <RotateCcw size={13} />
            <span>Couldn&apos;t launch · Retry</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-launch-primary"
            onClick={onLaunch}
            disabled={busy}
          >
            <Play size={13} fill="currentColor" />
            <span>Play</span>
          </button>
        )}
      </div>
    </div>
  )
}
