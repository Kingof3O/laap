import { Trash2, X } from 'lucide-react'

export interface DeleteConfirmModalProps {
  target: { id: string; name: string } | null
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  busy: boolean
}

export function DeleteConfirmModal({
  target,
  isOpen,
  onClose,
  onConfirm,
  busy,
}: DeleteConfirmModalProps) {
  if (!isOpen || !target) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-head">
          <h2 className="modal-title">Remove Profile</h2>
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
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Are you sure you want to remove <strong>{target.name}</strong>? Its stored session material and cached configuration will be removed.
          </p>
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
            className="btn-modal-danger"
            onClick={() => void onConfirm()}
            disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Trash2 size={13} />
            <span>{busy ? 'Removing…' : 'Remove Profile'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
