import { useState, type ReactNode } from 'react'
import type { LauncherController } from '../../hooks/useLauncher'
import { LauncherSettingsPanel } from './LauncherSettingsPanel'
import { product } from '../../product/flavors'
import { useDialog } from '../hooks/useDialog'
import { RotateCcw, ShieldCheck, X } from 'lucide-react'
import {
  APP_VERSION,
  type GitHubReleaseInfo,
  type UpdateStatus,
  type DownloadProgress,
} from '../../hooks/useUpdateChecker'
import {
  SettingsNavRail,
  type SettingsCategory,
} from './settings/SettingsNavRail'
import { UpdatesSettings } from './settings/UpdatesSettings'
import { SecuritySettings } from './settings/SecuritySettings'
import { AppearanceSettings } from './settings/AppearanceSettings'
import { AdvancedSettings } from './settings/AdvancedSettings'
import { AboutSettings } from './settings/AboutSettings'

export interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onResetRiot: () => Promise<void>
  onCheckUpdates?: () => Promise<void> | void
  checkingUpdates?: boolean
  updateStatus?: UpdateStatus
  downloadProgress?: DownloadProgress | null
  installError?: string | null
  onInstallUpdate?: () => Promise<void> | void
  busy: boolean
  launcher?: LauncherController
  lastChecked?: Date | null
  updateAvailable?: boolean
  latestRelease?: GitHubReleaseInfo | null
  autoCheckOnLaunch?: boolean
  onToggleAutoCheck?: (enabled: boolean) => void
  onOpenReleaseModal?: () => void
  currentVersion?: string
  advancedSettings?: ReactNode
}

export function SettingsModal({
  isOpen,
  onClose,
  onResetRiot,
  onCheckUpdates,
  checkingUpdates = false,
  updateStatus = 'idle',
  downloadProgress = null,
  installError = null,
  onInstallUpdate,
  busy,
  launcher,
  lastChecked = null,
  updateAvailable = false,
  latestRelease = null,
  autoCheckOnLaunch = true,
  onToggleAutoCheck,
  onOpenReleaseModal,
  currentVersion = APP_VERSION,
  advancedSettings,
}: SettingsModalProps) {
  const dialogRef = useDialog(isOpen, onClose, busy)
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general')

  if (!isOpen) return null

  return (
    <div className="modal-backdrop">
      <div
        className="modal-panel settings-workspace"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
      >
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 className="modal-title">Settings</h2>
            <span className="brand-lockup-inline brand-lockup-segmented brand-edition-tag brand-edition-basic">
              <img src="/logo.webp" alt="LAAP" className="brand-logo-img brand-lockup-logo" style={{ height: '18px', width: 'auto' }} />
              <span className="brand-divider" aria-hidden="true" />
              <span className="brand-tier-label brand-lockup-tier brand-edition-name">Basic</span>
            </span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="settings-layout">
          {/* Left Category Rail */}
          <SettingsNavRail
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
            hasUpdate={updateAvailable}
          />

          {/* Right Content Pane */}
          <div className="settings-content-pane settings-body">
            {activeCategory === 'general' && (
              <div className="settings-section">
                <div className="settings-section-header"><h3 className="settings-section-title">General</h3><p className="settings-section-desc">Manage your local session and account.</p></div>

                {/* Local data status: keep meaning explicit, avoid a hard-coded bright alert box. */}
                <div className="settings-security-summary">
                  <ShieldCheck size={21} aria-hidden="true" />
                  <div className="settings-security-content">
                    <strong>Saved Riot Logins Encrypted</strong>
                    <p>Saved Riot sessions use AES-GCM. Profile names and notes remain readable local data.</p>
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    onClick={() => void onResetRiot()}
                    disabled={busy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      height: '36px',
                    }}
                  >
                    <RotateCcw size={13} />
                    <span>Clean Active Riot Session & Reset</span>
                  </button>


                </div>

                {/* Lightweight version information, not another full card. */}
                <div className="settings-version-strip">
                  <div>
                    <strong>LAAP Desktop</strong>
                    <span>Account launcher</span>
                  </div>
                  <span className="settings-version-number">v{currentVersion}</span>
                </div>
              </div>
            )}

            {activeCategory === 'appearance' && (
              <AppearanceSettings disabled={busy} />
            )}

            {activeCategory === 'riot' && (
              <div className="settings-section">
                {launcher ? (
                  <LauncherSettingsPanel launcher={launcher} disabled={busy} section="riot" />
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    Launcher controller is currently unavailable.
                  </p>
                )}
                <button
                  type="button"
                  className="btn-modal-secondary"
                  onClick={() => void onResetRiot()}
                  disabled={busy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    height: '36px',
                    width: '100%',
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Clean Active Riot Session & Reset</span>
                </button>
              </div>
            )}

            {activeCategory === 'presence' && (
              <div className="settings-section">
                <div className="settings-section-header">
                  <h3 className="settings-section-title">LAAP Presence Configuration</h3>
                  <p className="settings-section-desc">
                    Control how your online/offline status is advertised to League of Legends chat servers.
                  </p>
                </div>
                {launcher ? (
                  <LauncherSettingsPanel launcher={launcher} disabled={busy} section="presence" />
                ) : null}
              </div>
            )}

            {activeCategory === 'updates' && (
              <UpdatesSettings
                currentVersion={currentVersion}
                checking={checkingUpdates}
                lastChecked={lastChecked}
                updateAvailable={updateAvailable}
                latestRelease={latestRelease}
                status={updateStatus}
                downloadProgress={downloadProgress}
                installError={installError}
                autoCheckOnLaunch={autoCheckOnLaunch}
                onToggleAutoCheck={onToggleAutoCheck ?? (() => {})}
                onCheckUpdates={onCheckUpdates}
                onInstallUpdate={onInstallUpdate}
                onOpenReleaseModal={onOpenReleaseModal}
                disabled={busy}
              />
            )}

            {activeCategory === 'security' && (
              <SecuritySettings busy={busy} />
            )}

            {activeCategory === 'advanced' && (
              <>
                <AdvancedSettings onResetRiot={onResetRiot} busy={busy} />
                {advancedSettings}
              </>
            )}

            {activeCategory === 'about' && (
              <AboutSettings currentVersion={currentVersion} />
            )}
          </div>
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="btn-modal-secondary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
