import { Trash2, X } from 'lucide-react'

interface DeleteConfirmModalProps {
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
      <div className="hextech-card modal-panel modal-panel-danger">
        <div className="corner-accent corner-tl" />
        <div className="corner-accent corner-tr" />
        <div className="corner-accent corner-bl" />
        <div className="corner-accent corner-br" />

        <div className="modal-head">
          <h2 className="modal-title">REMOVE PROFILE</h2>
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
            Are you sure you want to remove <strong>{target.name}</strong>? This profile and its stored authentication keys will be purged.
          </p>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn-modal-tertiary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger-confirm"
              onClick={() => void onConfirm()}
              disabled={busy}
            >
              <Trash2 size={14} />
              <span>{busy ? 'PURGING…' : 'CONFIRM REMOVAL'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
