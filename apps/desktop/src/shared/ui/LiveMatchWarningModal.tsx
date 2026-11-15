import { AlertTriangle, Play, X } from 'lucide-react'
import { useDialog } from '../hooks/useDialog'
import { formatLiveMode } from '../../lib/liveStatus'

export interface LiveMatchWarningTarget {
  accountId: string
  name: string
  gameMode: string | null
  elapsedMinutes: number | null
}

interface LiveMatchWarningModalProps {
  target: LiveMatchWarningTarget | null
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}

export function LiveMatchWarningModal({
  target,
  busy,
  onClose,
  onConfirm,
}: LiveMatchWarningModalProps) {
  const isOpen = !!target
  const dialogRef = useDialog(isOpen, onClose, busy)
  if (!isOpen || !target) return null

  const modeLabel = formatLiveMode(target.gameMode)
  const durationNote =
    target.elapsedMinutes !== null ? ` (${target.elapsedMinutes}m elapsed)` : ''

  return (
    <div className="modal-backdrop">
      <div
        className="modal-panel"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Live Match Warning"
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 className="modal-title">Active Match Detected</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="live-warning-banner">
            <AlertTriangle
              size={18}
              style={{ flexShrink: 0, color: 'var(--status-warning)', marginTop: '2px' }}
            />
            <div>
              <strong>{target.name}</strong> is currently in a live{' '}
              <strong>{modeLabel}</strong> match{durationNote}. Switching or
              launching another Riot session now could disrupt that active game.
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="btn-modal-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-modal-primary"
            onClick={onConfirm}
            disabled={busy}
          >
            <Play size={13} fill="currentColor" />
            <span>Launch Anyway</span>
          </button>
        </div>
      </div>
    </div>
  )
}
