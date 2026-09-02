import { LogOut, RotateCcw, ShieldCheck, X } from 'lucide-react'
import type { User } from '../../lib/types'

interface SettingsModalProps {
  user: User | null
  isOpen: boolean
  onClose: () => void
  onResetRiot: () => Promise<void>
  onLogout: () => Promise<void>
  busy: boolean
}

export function SettingsModal({
  user,
  isOpen,
  onClose,
  onResetRiot,
  onLogout,
  busy,
}: SettingsModalProps) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop">
      <div className="hextech-card modal-panel">
        <div className="corner-accent corner-tl" />
        <div className="corner-accent corner-tr" />
        <div className="corner-accent corner-bl" />
        <div className="corner-accent corner-br" />

        <div className="modal-head">
          <h2 className="modal-title">LAUNCHER CONFIGURATION</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Security Card */}
          <div className="settings-security-card">
            <div className="security-icon-circle">
              <ShieldCheck size={20} />
            </div>
            <div className="security-info">
              <span className="security-title">Hardware Identity Verified</span>
              <p className="security-desc">
                Ed25519 device keypair verified and linked to Riot session injection.
              </p>
            </div>
          </div>

          <div className="settings-actions-group">
            <button
              type="button"
              className="btn-modal-secondary"
              onClick={() => void onResetRiot()}
              disabled={busy}
            >
              <RotateCcw size={14} />
              <span>Restore Personal Riot Client Settings</span>
            </button>

            {user ? (
              <button
                type="button"
                className="btn-danger-confirm"
                onClick={() => void onLogout()}
                disabled={busy}
                style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}
              >
                <LogOut size={14} />
                <span>SIGN OUT ({user.displayName.toUpperCase()})</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
