import { HardDrive, Play, X, Zap } from 'lucide-react'
import type { Account, LocalAccountSummary } from '../../lib/types'

interface SyncAccountModalProps {
  targetAccount: Account | null
  localAccounts: LocalAccountSummary[]
  isOpen: boolean
  onClose: () => void
  onLinkFromLocal: (cloudAccountId: string, localId: string) => Promise<void>
  onSyncActive: (cloudAccountId: string) => Promise<void>
  onStartSandbox: (cloudAccountId: string) => Promise<void>
  busy: boolean
}

export function SyncAccountModal({
  targetAccount,
  localAccounts,
  isOpen,
  onClose,
  onLinkFromLocal,
  onSyncActive,
  onStartSandbox,
  busy,
}: SyncAccountModalProps) {
  if (!isOpen || !targetAccount) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-head">
          <h2 className="modal-title">Sync Session: {targetAccount.name}</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Link an authenticated Riot session to this shared profile:
          </p>

          {/* Option 1: Saved Local Profiles */}
          {localAccounts.length > 0 ? (
            <div className="field-block">
              <label className="field-label">Option 1: Link from Saved Local Profiles</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                {localAccounts.map((local) => (
                  <button
                    key={local.id}
                    type="button"
                    className="btn-modal-secondary"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', height: 'auto', textAlign: 'left' }}
                    onClick={() => void onLinkFromLocal(targetAccount.id, local.id)}
                    disabled={busy}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <HardDrive size={13} className="text-gold-primary" />
                      <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{local.name}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{local.region}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Option 2: Active Riot Client Login */}
          <div className="field-block">
            <label className="field-label">Option 2: Capture Active Riot Login</label>
            <button
              type="button"
              className="btn-modal-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '10px', height: 'auto', padding: '10px 14px' }}
              onClick={() => void onSyncActive(targetAccount.id)}
              disabled={busy}
            >
              <Zap size={15} style={{ color: 'var(--gold-primary)', flexShrink: 0 }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, color: '#FFFFFF', fontSize: '12px' }}>Upload Current PC Login</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Capture the login currently active in your Riot Client</div>
              </div>
            </button>
          </div>

          {/* Option 3: Sandbox Sign-In */}
          <div className="field-block">
            <label className="field-label">Option 3: Open Sign-In Sandbox</label>
            <button
              type="button"
              className="btn-modal-primary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              onClick={() => void onStartSandbox(targetAccount.id)}
              disabled={busy}
            >
              <Play size={13} fill="currentColor" />
              <span>Launch Clean Sandbox Window</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
