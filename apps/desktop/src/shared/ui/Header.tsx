import type { ReactNode } from 'react'
import { ArrowUpCircle, RefreshCw, Settings, Square } from 'lucide-react'
import { product } from '../../product/flavors'

export interface HeaderProps {
  brandLabel?: string
  isPro?: boolean
  onRefresh?: () => void
  onOpenSettings: () => void
  onOpenBilling?: () => void
  riotRunning?: boolean
  operationBusy?: boolean
  presenceControl?: ReactNode
  billingControl?: ReactNode
  onStopRiot?: () => Promise<void>
  updateAvailable?: boolean
  onOpenUpdates?: () => void
}

export function Header({
  onRefresh,
  brandLabel = product.name,
  isPro = false,
  onOpenSettings,
  onOpenBilling,
  riotRunning = false,
  operationBusy = false,
  onStopRiot,
  presenceControl,
  billingControl,
  updateAvailable = false,
  onOpenUpdates,
}: HeaderProps) {
  const tierName = isPro ? 'Pro' : 'Basic'
  const editionName = isPro ? 'LAAP Pro' : brandLabel
  const editionTag = editionName.replace(/^LAAP\s+/, '')

  return (
    <header className="header-bar" data-tauri-drag-region>
      {/* Brand Identity & Edition (Borderless Logo | Tier) */}
      <div className="brand-zone" data-tauri-drag-region>
        {onOpenBilling ? (
          <button
            type="button"
            className={`brand-lockup-inline brand-lockup-segmented brand-edition-tag ${isPro ? 'brand-lockup-pro brand-edition-pro' : 'brand-lockup-basic brand-edition-basic'}`}
            onClick={onOpenBilling}
            title={isPro ? 'LAAP Pro Active — click to manage' : 'LAAP Basic — click to upgrade to Pro'}
            aria-label={`Edition: LAAP ${tierName}`}
          >
            <img
              src="/logo.webp"
              alt="LAAP"
              className="brand-logo-img brand-lockup-logo"
            />
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-tier-label brand-lockup-tier brand-edition-name">{tierName}</span>
          </button>
        ) : (
          <span
            className={`brand-lockup-inline brand-lockup-segmented brand-edition-tag ${isPro ? 'brand-lockup-pro brand-edition-pro' : 'brand-lockup-basic brand-edition-basic'}`}
            aria-label={`Edition: ${editionName}`}
          >
            <img
              src="/logo.webp"
              alt="LAAP"
              className="brand-logo-img brand-lockup-logo"
            />
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-tier-label brand-lockup-tier brand-edition-name">{editionTag}</span>
          </span>
        )}
      </div>


      {/* Header Utilities */}
      <div className="header-utilities">
        {presenceControl}
        {billingControl}

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
