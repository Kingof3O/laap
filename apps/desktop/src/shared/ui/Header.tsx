import type { ReactNode } from 'react'
import { ArrowUpCircle, Database, Gamepad2, RefreshCw, Settings, Square } from 'lucide-react'
import type { AppMode, User } from '../../lib/types'

export interface HeaderProps {
  appMode: AppMode
  onModeChange: (mode: AppMode) => void
  user: User | null
  onRefresh: () => void
  onOpenSettings: () => void
  isOfflineOnly?: boolean
  riotRunning?: boolean
  operationBusy?: boolean
  presenceControl?: ReactNode
  onStopRiot?: () => Promise<void>
  updateAvailable?: boolean
  onOpenUpdates?: () => void
}

export function Header({
  appMode,
  onModeChange,
  user,
  onRefresh,
  onOpenSettings,
  isOfflineOnly = false,
  riotRunning = false,
  operationBusy = false,
  onStopRiot,
  presenceControl,
  updateAvailable = false,
  onOpenUpdates,
}: HeaderProps) {
  return (
    <header className="header-bar" data-tauri-drag-region>
      {/* Brand Identity & Edition */}
      <div className="brand-zone" data-tauri-drag-region>
        <img
          src="/logo.webp"
          alt="LAAP"
          style={{ height: '24px', width: 'auto', objectFit: 'contain' }}
        />
        <span
          className={`brand-edition-tag ${isOfflineOnly ? 'brand-edition-offline' : 'brand-edition-team'}`}
        >
          {isOfflineOnly ? 'Offline Edition' : 'Team Edition'}
        </span>
      </div>

      {/* Mode Navigation Switcher (Team Edition only) */}
      {!isOfflineOnly ? (
        <nav className="mode-nav" aria-label="Launcher Modes">
          <button
            type="button"
            disabled={operationBusy}
            className={`mode-pill ${appMode === 'local' ? 'mode-pill-active' : ''}`}
            onClick={() => onModeChange('local')}
          >
            <Gamepad2 size={15} />
            <span>Personal Roster</span>
          </button>
          <button
            type="button"
            disabled={operationBusy}
            className={`mode-pill ${appMode === 'cloud' ? 'mode-pill-active' : ''}`}
            onClick={() => onModeChange('cloud')}
          >
            <Database size={15} />
            <span>Shared Accounts</span>
          </button>
        </nav>
      ) : null}

      {/* Header Utilities */}
      <div className="header-utilities">
        {presenceControl}

        {updateAvailable ? (
          <button
            type="button"
            className="header-update-badge"
            onClick={onOpenUpdates ?? onOpenSettings}
            title="A new version of LAAP is available"
            aria-label="Update available"
          >
            <ArrowUpCircle size={14} />
            <span>Update available</span>
          </button>
        ) : null}

        {onStopRiot && riotRunning ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={operationBusy}
            onClick={() => void onStopRiot()}
            title="Safely exit active Riot client"
            style={{ height: '34px', fontSize: '12px' }}
          >
            <Square size={12} fill="currentColor" />
            <span>Stop Riot</span>
          </button>
        ) : null}

        {!isOfflineOnly && user ? (
          <div
            className="profile-badge"
            onClick={onOpenSettings}
            role="button"
            tabIndex={0}
            title="Account settings"
          >
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
          disabled={operationBusy}
        >
          <RefreshCw size={15} />
        </button>

        <button
          type="button"
          className="header-icon-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  )
}
