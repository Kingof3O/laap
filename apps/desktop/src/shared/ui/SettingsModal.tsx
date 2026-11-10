import { useState } from 'react'
import type { LauncherController } from '../../hooks/useLauncher'
import { LauncherSettingsPanel } from './LauncherSettingsPanel'
import { IS_OFFLINE_ONLY } from '../../lib/api'
import { useDialog } from '../hooks/useDialog'
import { LogOut, RotateCcw, ShieldCheck, X } from 'lucide-react'
import type { User } from '../../lib/types'
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
  user: User | null
  isOpen: boolean
  onClose: () => void
  onResetRiot: () => Promise<void>
  onLogout: () => Promise<void>
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
}

export function SettingsModal({
  user,
  isOpen,
  onClose,
  onResetRiot,
  onLogout,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 className="modal-title">Launcher Configuration</h2>
            <span className="badge-gold" style={{ fontSize: '10px' }}>
              {IS_OFFLINE_ONLY ? 'Offline Edition' : 'Team Edition'}
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

                {/* Security Status Card */}
                <div
                  style={{
                    padding: '14px',
                    background: 'rgba(52, 184, 153, 0.08)',
                    borderRadius: '8px',
                    border: '1px solid rgba(52, 184, 153, 0.25)',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                  }}
                >
                  <ShieldCheck
                    size={22}
                    style={{ color: 'var(--status-ready)', flexShrink: 0 }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#FFFFFF',
                      }}
                    >
                      {IS_OFFLINE_ONLY
                        ? 'Local Vault Encrypted'
                        : 'Local device identity'}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '2px',
                      }}
                    >
                      {IS_OFFLINE_ONLY
                        ? 'AES-GCM encrypted local vault. Icons, rank sync and LAAP Presence setup can use the network.'
                        : 'Your local identity is used for shared-account access.'}
                    </div>
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

                  {user ? (
                    <button
                      type="button"
                      className="btn-modal-secondary"
                      onClick={() => void onLogout()}
                      disabled={busy}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        height: '36px',
                        color: '#fca5a5',
                      }}
                    >
                      <LogOut size={13} />
                      <span>Sign Out ({user.displayName})</span>
                    </button>
                  ) : null}
                </div>

                {/* About Strip */}
                <div
                  style={{
                    marginTop: '8px',
                    padding: '10px 14px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div
                      style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}
                    >
                      LAAP Tactical Launcher
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Account launcher
                    </div>
                  </div>
                  <div
                    style={{ fontSize: '11px', color: 'var(--color-accent-400)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}
                  >
                    v{currentVersion}
                  </div>
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
              <AdvancedSettings onResetRiot={onResetRiot} busy={busy} />
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
