import {
  Gamepad2,
  KeyRound,
  Play,
  Plus,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import type { Game } from '../../lib/types'

export interface EmptyStateProps {
  searchActive?: boolean
  onAction?: () => void
  onQuickImport?: () => void
  activeGame?: Game
  hasAnyProfiles?: boolean
  onSwitchGame?: (game: Game) => void
}

export function EmptyState({
  searchActive = false,
  onAction,
  onQuickImport,
  activeGame,
  hasAnyProfiles = false,
  onSwitchGame,
}: EmptyStateProps) {
  if (searchActive) {
    return (
      <div className="empty-state-card" style={{ margin: '32px 24px' }}>
        <div className="empty-state-icon">
          <Gamepad2 size={24} />
        </div>
        <h3 className="empty-state-title">No matching profiles</h3>
        <p className="empty-state-text">
          No profiles matched your search, region, or rank filters.
        </p>
      </div>
    )
  }

  const isGameEmpty = hasAnyProfiles && Boolean(activeGame)

  return (
    <div className="empty-stage-container">
      {/* Grounding Card: Blueprint Preview + Actions */}
      <div className="empty-blueprint-panel">
        <div className="ghost-card-preview" aria-hidden="true">
          <div className="ghost-avatar">
            <img
              src="/favicon.webp"
              alt=""
              style={{ width: '22px', height: '22px', borderRadius: '5px' }}
            />
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
            {isGameEmpty
                ? activeGame === 'valorant'
                  ? 'No VALORANT profiles yet'
                  : 'No League profiles yet'
                : 'Your Personal Roster is Empty'}
          </h2>
          <p className="empty-state-text">
            {isGameEmpty
                ? activeGame === 'valorant'
                  ? 'Add a profile to launch VALORANT with one click, or switch back to your League roster.'
                  : 'Add a profile to launch League through the official Riot Client, or switch back to your VALORANT roster.'
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
                <span>
                  {isGameEmpty
                      ? activeGame === 'valorant'
                        ? 'Add VALORANT Profile'
                        : 'Add League Profile'
                      : 'Register New Profile'}
                </span>
              </button>
            ) : null}

            {isGameEmpty && onSwitchGame ? (
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => onSwitchGame(activeGame === 'valorant' ? 'league' : 'valorant')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <img
                  src={activeGame === 'valorant' ? '/league-of-legends-icon.webp' : '/valorant-icon.webp'}
                  alt=""
                  style={{ width: '16px', height: '16px', objectFit: 'contain', borderRadius: '3px' }}
                  aria-hidden="true"
                />
                <span>
                  {activeGame === 'valorant'
                    ? 'Switch to League'
                    : 'Switch to VALORANT'}
                </span>
              </button>
            ) : null}

            {!isGameEmpty && onQuickImport ? (
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={onQuickImport}
                title="Automatically detect and save the account currently logged in Riot Client"
              >
                <Zap
                  size={14}
                  style={{
                    color: 'var(--accent-primary)',
                    marginRight: '6px',
                    flexShrink: 0,
                  }}
                />
                <span>Import from Riot Client</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Feature Trust Anchors */}
        <div className="empty-trust-row">
          <div className="trust-item">
            <ShieldCheck
              size={14}
              style={{
                color: 'var(--status-ready)',
                marginRight: '4px',
                flexShrink: 0,
              }}
            />
            <span>No memory injection</span>
          </div>
          <div className="trust-divider" />
          <div className="trust-item">
            <Zap
              size={14}
              style={{
                color: 'var(--accent-primary)',
                marginRight: '4px',
                flexShrink: 0,
              }}
            />
            <span>1-Click Launch</span>
          </div>
          <div className="trust-divider" />
          <div className="trust-item">
            <KeyRound
              size={14}
              style={{
                color: 'var(--text-muted)',
                marginRight: '4px',
                flexShrink: 0,
              }}
            />
            <span>Encrypted Riot logins</span>
          </div>
        </div>
      </div>
    </div>
  )
}
