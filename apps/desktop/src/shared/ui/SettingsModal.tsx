import { LogOut, RotateCcw, ShieldCheck, X } from 'lucide-react'
import type { User } from '../../lib/types'

export interface SettingsModalProps {
  user: User | null
  isOpen: boolean
  onClose: () => void
  onResetRiot: () => Promise<void>
  onLogout: () => Promise<void>
  onCheckUpdates?: () => Promise<void> | void
  checkingUpdates?: boolean
  busy: boolean
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
}: SettingsModalProps) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
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

        <div className="modal-body">
          {/* Security Card */}
          <div style={{ padding: '14px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <ShieldCheck size={22} style={{ color: 'var(--status-ready)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Hardware Identity Verified</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Ed25519 device keypair verified and linked to your LAAP account.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              className="btn-modal-secondary"
              onClick={() => void onResetRiot()}
              disabled={busy}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '36px' }}
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
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '36px' }}
              >
                <span>{checkingUpdates ? 'Checking for updates…' : 'Check for Updates (v0.2.0)'}</span>
              </button>
            ) : null}

            {user ? (
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => void onLogout()}
                disabled={busy}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '36px', color: '#fca5a5' }}
              >
                <LogOut size={13} />
                <span>Sign Out ({user.displayName})</span>
              </button>
            ) : null}
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
