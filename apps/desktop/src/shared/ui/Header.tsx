import type { ReactNode } from 'react'
import { ArrowUpCircle, RefreshCw, Settings, Square } from 'lucide-react'
import { product } from '../../product/flavors'

export interface HeaderProps {
  navigation?: ReactNode
  onRefresh?: () => void
  onOpenSettings: () => void
  riotRunning?: boolean
  operationBusy?: boolean
  presenceControl?: ReactNode
  onStopRiot?: () => Promise<void>
  updateAvailable?: boolean
  onOpenUpdates?: () => void
}

export function Header({
  navigation,  onRefresh,
  onOpenSettings,
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
        <span className="brand-edition-tag">{product.name}</span>
      </div>

      {navigation}

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

        {onRefresh && <button
          type="button"
          className="header-icon-btn"
          onClick={onRefresh}
          title="Refresh Accounts"
          aria-label="Refresh Accounts"
          disabled={operationBusy}
        >
          <RefreshCw size={15} />
        </button>}

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
