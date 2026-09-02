import { Gamepad2, RefreshCw, Settings, Users, Zap } from 'lucide-react'
import type { AppMode, User } from '../../lib/types'

interface HeaderProps {
  appMode: AppMode
  onModeChange: (mode: AppMode) => void
  user: User | null
  onRefresh: () => void
  onOpenSettings: () => void
}

export function Header({
  appMode,
  onModeChange,
  user,
  onRefresh,
  onOpenSettings,
}: HeaderProps) {
  return (
    <header className="header-bar" data-tauri-drag-region>
      {/* Brand Identity */}
      <div className="brand-zone">
        <div className="brand-crest">
          <Zap size={16} fill="currentColor" />
        </div>
        <div className="brand-text-block">
          <span className="brand-name">LAAP</span>
          <span className="brand-tag">TACTICAL</span>
        </div>
      </div>

      {/* Mode Navigation Switcher */}
      <nav className="mode-nav">
        <button
          type="button"
          className={`mode-pill ${appMode === 'local' ? 'mode-pill-active' : ''}`}
          onClick={() => onModeChange('local')}
        >
          <Gamepad2 size={15} />
          <span>Personal Roster</span>
        </button>
        <button
          type="button"
          className={`mode-pill ${appMode === 'cloud' ? 'mode-pill-active' : ''}`}
          onClick={() => onModeChange('cloud')}
        >
          <Users size={15} />
          <span>Team Vault</span>
        </button>
      </nav>

      {/* Header Utilities & Profile */}
      <div className="header-utilities">
        {user ? (
          <div className="profile-badge" onClick={onOpenSettings} role="button" tabIndex={0}>
            <div className="profile-avatar">
              {user.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="profile-info">
              <span className="profile-name">{user.displayName}</span>
              <span className="profile-role">{user.role}</span>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="utility-btn"
          onClick={onRefresh}
          title="Refresh Accounts"
          aria-label="Refresh Accounts"
        >
          <RefreshCw size={14} />
        </button>

        <button
          type="button"
          className="utility-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </header>
  )
}
