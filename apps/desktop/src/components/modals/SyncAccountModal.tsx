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
      <div className="hextech-card modal-panel">
        <div className="corner-accent corner-tl" />
        <div className="corner-accent corner-tr" />
        <div className="corner-accent corner-bl" />
        <div className="corner-accent corner-br" />

        <div className="modal-head">
          <h2 className="modal-title">SYNC SESSION: {targetAccount.name.toUpperCase()}</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-instruction">
            Select a method to link an authenticated Riot session to this team profile:
          </p>

          {/* Option 1: Saved Local Profiles */}
          {localAccounts.length > 0 ? (
            <div className="sync-section">
              <label className="field-label">OPTION 1: LINK FROM SAVED PROFILES</label>
              <div className="local-selection-list">
                {localAccounts.map((local) => (
                  <button
                    key={local.id}
                    type="button"
                    className="local-option-card"
                    onClick={() => void onLinkFromLocal(targetAccount.id, local.id)}
                    disabled={busy}
                  >
                    <div className="local-option-left">
                      <HardDrive size={14} className="local-option-icon" />
                      <span className="local-option-name">{local.name}</span>
                      <span className="local-option-region">{local.region}</span>
                    </div>
                    <span className="local-option-action">Link & Sync →</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Option 2: Live Methods */}
          <div className="sync-section">
            <label className="field-label">OPTION 2: DIRECT PROVISIONING</label>
            <div className="modal-button-stack">
              <button
                type="button"
                className="btn-hextech-submit"
                onClick={() => void onSyncActive(targetAccount.id)}
                disabled={busy}
              >
                <Zap size={14} />
                <span>UPLOAD ACTIVE RIOT LOGIN FROM THIS PC</span>
              </button>

              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => void onStartSandbox(targetAccount.id)}
                disabled={busy}
              >
                <Play size={14} />
                <span>OPEN RIOT SIGN-IN SANDBOX</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
