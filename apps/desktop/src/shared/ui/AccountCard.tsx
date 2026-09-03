import { KeyRound, Play, RotateCcw, Trash2, UploadCloud, Zap } from 'lucide-react'

export interface AccountCardProps {
  id: string
  name: string
  region: string
  lastUsedText?: string | null
  hasSession?: boolean
  status?: string
  isSelected?: boolean
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  onSelect?: () => void
  onLaunch: () => void
  onSync?: () => void
  onPushToCloud?: () => void
  onForceRelease?: () => void
  onRevokeSession?: () => void
  onDelete: () => void
}

export function AccountCard({
  name,
  region,
  lastUsedText,
  hasSession = true,
  status = 'Available',
  isSelected = false,
  isCloud = false,
  canManage = false,
  busy = false,
  onSelect,
  onLaunch,
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
              {isLeased ? (
                <span className="status-indicator status-indicator-warn">
                  <span className="status-beacon status-beacon-amber" />
                  Currently In Use
                </span>
              ) : hasSession ? (
                <span className="status-indicator status-indicator-ready">
                  <span className="status-beacon status-beacon-ready" />
                  Ready to Launch
                </span>
              ) : (
                <span className="status-indicator status-indicator-warn">
                  <span className="status-beacon status-beacon-amber" />
                  Needs Session Sync
                </span>
              )}
              {lastUsedText ? (
                <span className="last-played-text">· {lastUsedText}</span>
              ) : null}
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
              title="Publish to Shared Vault"
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
              <span>Currently In Use</span>
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn-launch-primary"
            onClick={onLaunch}
            disabled={busy}
          >
            <Play size={13} fill="currentColor" />
            <span>{isCloud ? 'Claim & Launch' : 'Play Game'}</span>
          </button>
        )}
      </div>
    </div>
  )
}
