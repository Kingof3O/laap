import { Gamepad2, HardDrive, KeyRound, Play, Plus, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react'

export interface EmptyStateProps {
  isCloud?: boolean
  searchActive?: boolean
  onAction?: () => void
  onQuickImport?: () => void
}

export function EmptyState({
  isCloud = false,
  searchActive = false,
  onAction,
  onQuickImport,
}: EmptyStateProps) {
  if (searchActive) {
    return (
      <div className="empty-state-card" style={{ margin: '32px 24px' }}>
        <div className="empty-state-icon">
          <Gamepad2 size={24} />
        </div>
        <h3 className="empty-state-title">No matching profiles</h3>
        <p className="empty-state-text">
          No accounts matched your search query or region filter.
        </p>
      </div>
    )
  }

  return (
    <div className="empty-stage-container">
      {/* Grounding Card: Blueprint Preview + Actions */}
      <div className="empty-blueprint-panel">
        <div className="ghost-card-preview" aria-hidden="true">
          <div className="ghost-avatar">
            <img src="/favicon.webp" alt="" style={{ width: '22px', height: '22px', borderRadius: '5px' }} />
          </div>
          <div className="ghost-info">
            <div className="ghost-line ghost-line-title" />
            <div className="ghost-line ghost-line-sub" />
          </div>
          <div className="ghost-badge">
            <span className="ghost-dot" />
            <span>Ready</span>
          </div>
          <div className="ghost-btn">
            <Play size={10} fill="currentColor" />
            <span>Launch</span>
          </div>
        </div>

        <div className="empty-content-block">
          <h2 className="empty-state-title">
            {isCloud ? 'Shared Accounts is Empty' : 'Your Personal Roster is Empty'}
          </h2>
          <p className="empty-state-text">
            {isCloud
              ? 'No shared accounts have been added to the pool yet. Publish accounts from your local roster or add cloud accounts.'
              : 'Add a profile to launch League through the official Riot Client with one click.'}
          </p>

          {/* Grounded Action Buttons */}
          <div className="empty-actions-row">
            {onAction ? (
              <button
                type="button"
                className="btn-modal-primary"
                onClick={onAction}
              >
                <Plus size={15} style={{ marginRight: '6px', flexShrink: 0 }} />
                <span>{isCloud ? 'Add Shared Account' : 'Register New Profile'}</span>
              </button>
            ) : null}

            {!isCloud && onQuickImport ? (
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={onQuickImport}
                title="Automatically detect and save the account currently logged in Riot Client"
              >
                <Zap size={14} style={{ color: 'var(--gold-primary)', marginRight: '6px', flexShrink: 0 }} />
                <span>Import from Riot Client</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Feature Trust Anchors */}
        <div className="empty-trust-row">
          <div className="trust-item">
            <ShieldCheck size={14} style={{ color: 'var(--status-ready)', marginRight: '4px', flexShrink: 0 }} />
            <span>No memory injection</span>
          </div>
          <div className="trust-divider" />
          <div className="trust-item">
            <Zap size={14} style={{ color: 'var(--gold-primary)', marginRight: '4px', flexShrink: 0 }} />
            <span>1-Click Launch</span>
          </div>
          <div className="trust-divider" />
          <div className="trust-item">
            <KeyRound size={14} style={{ color: 'var(--text-muted)', marginRight: '4px', flexShrink: 0 }} />
            <span>Device identity</span>
          </div>
        </div>
      </div>
    </div>
  )
}
