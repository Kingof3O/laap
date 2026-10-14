import type { LauncherController } from '../../hooks/useLauncher'
import { LauncherSettingsPanel } from './LauncherSettingsPanel'
import { IS_OFFLINE_ONLY } from '../../lib/api'
import { useDialog } from '../hooks/useDialog'
import { LogOut, RotateCcw, ShieldCheck, X } from 'lucide-react'
import type { User } from '../../lib/types'
import { APP_VERSION } from '../../hooks/useUpdateChecker'

export interface SettingsModalProps {
  user: User | null
  isOpen: boolean
  onClose: () => void
  onResetRiot: () => Promise<void>
  onLogout: () => Promise<void>
  onCheckUpdates?: () => Promise<void> | void
  checkingUpdates?: boolean
  busy: boolean
  launcher?: LauncherController
}

export function SettingsModal({
  user,
  isOpen,
  onClose,
  onResetRiot,
  onLogout,
  onCheckUpdates,
  checkingUpdates = false,
  busy,
  launcher,
}: SettingsModalProps) {
  const dialogRef = useDialog(isOpen, onClose, busy)
  if (!isOpen) return null

  return (
    <div className="modal-backdrop">
      <div
        className="modal-panel"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 className="modal-title">Launcher Configuration</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body settings-body">
          {launcher ? (
            <LauncherSettingsPanel launcher={launcher} disabled={busy} />
          ) : null}
          {/* Security Card */}
          <div
            style={{
              padding: '14px',
              background: 'rgba(16, 185, 129, 0.08)',
              borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.25)',
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
                style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}
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
                  ? 'AES-GCM local storage. Icons, League sync and presence services connect only when you enable them.'
                  : 'Your local identity is used for shared-account access.'}
              </div>
            </div>
          </div>

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

            {onCheckUpdates ? (
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => void onCheckUpdates()}
                disabled={busy || checkingUpdates}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  height: '36px',
                }}
              >
                <span>
                  {checkingUpdates
                    ? 'Checking for updates…'
                    : `Check for Updates (v${APP_VERSION})`}
                </span>
              </button>
            ) : null}

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

          {/* About Section */}
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div
                style={{ fontSize: '12px', fontWeight: 600, color: '#F0E6D2' }}
              >
                LAAP Tactical Launcher
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Developed by Hussien Salah
              </div>
            </div>
            <div
              style={{ fontSize: '11px', color: '#C89B3C', fontWeight: 600 }}
            >
              v{APP_VERSION}
            </div>
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
