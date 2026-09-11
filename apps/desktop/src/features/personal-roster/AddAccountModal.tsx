import { useState } from 'react'
import { Play, X, Zap } from 'lucide-react'
import { SELECTABLE_REGIONS } from '../../lib/constants'

interface AddAccountModalProps {
  isOpen: boolean
  onClose: () => void
  onCaptureActive: (name: string, region: string) => Promise<void>
  onStartSandbox: (name: string, region: string) => Promise<void>
  onCancelSandbox: () => Promise<void>
  provisioning: boolean
  busy: boolean
}

export function AddAccountModal({
  isOpen,
  onClose,
  onCaptureActive,
  onStartSandbox,
  onCancelSandbox,
  provisioning,
  busy,
}: AddAccountModalProps) {
  const [name, setName] = useState('')
  const [region, setRegion] = useState('EUW')

  if (!isOpen) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-head">
          <h2 className="modal-title">Add Account</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => {
              if (provisioning) void onCancelSandbox()
              onClose()
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field-block">
            <label className="field-label">Account Name / Riot ID</label>
            <input
              type="text"
              className="hextech-input"
              placeholder="e.g. Faker#KR1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={provisioning || busy}
              required
            />
          </div>

          <div className="field-block">
            <label className="field-label">Server Region</label>
            <select
              className="hextech-select"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={provisioning || busy}
            >
              {SELECTABLE_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {provisioning ? (
            <div style={{ padding: '16px', background: 'rgba(200, 170, 110, 0.08)', borderRadius: '8px', border: '1px solid rgba(200, 170, 110, 0.25)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold-light)', fontSize: '13px', fontWeight: 600 }}>
                <Zap size={15} />
                <span>Waiting for Riot Sign-In…</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Sign into your Riot account in the client window and ensure &quot;Stay signed in&quot; is checked. LAAP will automatically detect your login.
              </p>
            </div>
          ) : null}
        </div>

        <div className="modal-foot">
          {provisioning ? (
            <button
              type="button"
              className="btn-modal-secondary"
              onClick={() => void onCancelSandbox()}
              disabled={busy}
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => void onCaptureActive(name, region)}
                disabled={!name.trim() || busy}
                title="Save current logged-in Riot account without re-entering credentials"
              >
                Import Current Account
              </button>
              <button
                type="button"
                className="btn-modal-primary"
                onClick={() => void onStartSandbox(name, region)}
                disabled={!name.trim() || busy}
              >
                <Play size={12} fill="currentColor" />
                <span>Sign In To Another Account</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
