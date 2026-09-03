import { Database, Gamepad2, RefreshCw, Settings, Zap } from 'lucide-react'
import type { AppMode, User } from '../../lib/types'

export interface HeaderProps {
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
        <img
          src="/logo.webp"
          alt="LAAP"
          style={{ height: '26px', width: 'auto', objectFit: 'contain' }}
        />
      </div>

      {/* Mode Navigation Switcher */}
      <nav className="mode-nav" aria-label="Launcher Modes">
        <button
          type="button"
          className={`mode-pill ${appMode === 'local' ? 'mode-pill-active' : ''}`}
          onClick={() => onModeChange('local')}
        >
          <Gamepad2 size={14} />
          <span>Personal Roster</span>
        </button>
        <button
          type="button"
          className={`mode-pill ${appMode === 'cloud' ? 'mode-pill-active' : ''}`}
          onClick={() => onModeChange('cloud')}
        >
          <Database size={14} />
          <span>Shared Accounts</span>
        </button>
      </nav>

      {/* Header Utilities & Profile */}
      <div className="header-utilities">
        {user ? (
          <div className="profile-badge" onClick={onOpenSettings} role="button" tabIndex={0}>
            <div className="profile-avatar">
              {user.displayName.slice(0, 2).toUpperCase()}
            </div>
            <span className="profile-name">{user.displayName}</span>
            <span className="profile-role-tag">{user.role}</span>
          </div>
        ) : null}

        <button
          type="button"
          className="header-icon-btn"
          onClick={onRefresh}
          title="Refresh Accounts"
          aria-label="Refresh Accounts"
        >
          <RefreshCw size={14} />
        </button>

        <button
          type="button"
          className="header-icon-btn"
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
