import { CheckCircle2, Play, Trash2, UploadCloud, Zap } from 'lucide-react'

interface AccountCardProps {
  id: string
  name: string
  region: string
  lastUsedText?: string | null
  hasSession?: boolean
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  onLaunch: () => void
  onSync?: () => void
  onPushToCloud?: () => void
  onDelete: () => void
}

export function AccountCard({
  name,
  region,
  lastUsedText,
  hasSession = true,
  isCloud = false,
  canManage = false,
  busy = false,
  onLaunch,
  onSync,
  onPushToCloud,
  onDelete,
}: AccountCardProps) {
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <div className={`roster-card ${hasSession ? 'roster-card-ready' : 'roster-card-unsynced'}`}>
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
              {hasSession ? (
                <span className="status-indicator status-indicator-ready">
                  <span className="status-beacon status-beacon-teal" />
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
        <div className="card-secondary-actions">
          {canManage && isCloud && onSync ? (
            <button
              type="button"
              className="action-icon-btn action-icon-btn-sync"
              onClick={onSync}
              disabled={busy}
              title="Sync Login Session"
            >
              <Zap size={14} />
            </button>
          ) : null}

          {canManage && !isCloud && onPushToCloud ? (
            <button
              type="button"
              className="action-icon-btn action-icon-btn-cloud"
              onClick={onPushToCloud}
              disabled={busy}
              title="Publish to Team Vault"
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
      <div className="card-bottom-row">
        <button
          type="button"
          className="btn-launch-primary"
          onClick={onLaunch}
          disabled={busy}
        >
          <Play size={14} fill="currentColor" />
          <span>{isCloud ? 'Claim & Launch' : 'Play Game'}</span>
        </button>
      </div>
    </div>
  )
}
