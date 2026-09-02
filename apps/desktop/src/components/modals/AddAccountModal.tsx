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
      <div className="hextech-card modal-panel">
        <div className="corner-accent corner-tl" />
        <div className="corner-accent corner-tr" />
        <div className="corner-accent corner-bl" />
        <div className="corner-accent corner-br" />

        <div className="modal-head">
          <h2 className="modal-title">REGISTER SUMMONER PROFILE</h2>
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
            <label className="field-label">SUMMONER NAME / RIOT ID</label>
            <input
              type="text"
              className="hextech-input"
              placeholder="e.g. Faker#KR1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={provisioning || busy}
            />
          </div>

          <div className="field-block">
            <label className="field-label">SERVER REGION</label>
            <select
              className="hextech-input"
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
            <div className="provisioning-callout">
              <div className="callout-indicator">
                <Zap size={16} className="callout-icon" />
                <span>Riot Client opened. Sign in once with &quot;Stay signed in&quot; checked.</span>
              </div>
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => void onCancelSandbox()}
                style={{ width: '100%', marginTop: '12px' }}
              >
                Cancel Sandbox
              </button>
            </div>
          ) : (
            <div className="modal-button-stack">
              <button
                type="button"
                className="btn-hextech-submit"
                onClick={() => void onCaptureActive(name, region)}
                disabled={busy || !name.trim()}
              >
                <Zap size={15} />
                <span>CAPTURE ACTIVE RIOT LOGIN</span>
              </button>

              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => void onStartSandbox(name, region)}
                disabled={busy || !name.trim()}
              >
                <Play size={14} />
                <span>OPEN RIOT SIGN-IN SANDBOX</span>
              </button>

              <button
                type="button"
                className="btn-modal-tertiary"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
