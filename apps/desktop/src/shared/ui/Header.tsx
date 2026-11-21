import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  ArrowUpCircle,
  Command,
  Eye,
  EyeOff,
  RefreshCw,
  Settings,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { product } from '../../product/flavors'
import { isStreamerModeEnabled, setStreamerMode } from '../../lib/streamerMode'
import { isSoundEnabled, setSoundEnabled, playHextechSelect } from '../../lib/soundEffects'

export interface HeaderProps {
  brandLabel?: string
  isPro?: boolean
  onRefresh?: () => void
  onOpenSettings: () => void
  onOpenBilling?: () => void
  onOpenPalette?: () => void
  onOpenCompare?: () => void
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
  onOpenPalette,
  onOpenCompare,
  riotRunning = false,
  operationBusy = false,
  onStopRiot,
  presenceControl,
  billingControl,
  updateAvailable = false,
  onOpenUpdates,
}: HeaderProps) {
  const [streamerMode, setStreamer] = useState(isStreamerModeEnabled())
  const [soundOn, setSound] = useState(isSoundEnabled())

  useEffect(() => {
    const streamerHandler = (e: Event) => setStreamer((e as CustomEvent<boolean>).detail)
    const soundHandler = (e: Event) => setSound((e as CustomEvent<boolean>).detail)
    window.addEventListener('laap:streamer-mode-changed', streamerHandler)
    window.addEventListener('laap:sound-changed', soundHandler)
    return () => {
      window.removeEventListener('laap:streamer-mode-changed', streamerHandler)
      window.removeEventListener('laap:sound-changed', soundHandler)
    }
  }, [])

  const handleToggleStreamer = () => {
    const next = !streamerMode
    setStreamerMode(next)
    setStreamer(next)
    playHextechSelect()
  }

  const handleToggleSound = () => {
    const next = !soundOn
    setSoundEnabled(next)
    setSound(next)
    if (next) playHextechSelect()
  }

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
        {onOpenPalette ? (
          <button
            type="button"
            className="header-palette-btn"
            onClick={onOpenPalette}
            title="Command Palette (Ctrl+K / ⌘K)"
            aria-label="Open Command Palette"
          >
            <Command size={13} />
            <span>Search &amp; Launch</span>
            <kbd className="header-kbd">Ctrl+K</kbd>
          </button>
        ) : null}

        {onOpenCompare ? (
          <button
            type="button"
            className="header-icon-btn"
            onClick={onOpenCompare}
            title="Compare Accounts Matrix"
            aria-label="Compare Accounts"
          >
            <Sparkles size={15} />
          </button>
        ) : null}

        <button
          type="button"
          className={`header-icon-btn ${streamerMode ? 'active-accent' : ''}`}
          onClick={handleToggleStreamer}
          title={streamerMode ? 'Streamer Mode Active (Click to disable)' : 'Enable Streamer Mode (Privacy Shield)'}
          aria-label="Streamer Mode"
        >
          {streamerMode ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>

        <button
          type="button"
          className="header-icon-btn"
          onClick={handleToggleSound}
          title={soundOn ? 'Tactile Sound On (Click to mute)' : 'Sound Muted (Click to unmute)'}
          aria-label="Tactile Audio"
        >
          {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>

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

        {onRefresh && (
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
        )}

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
