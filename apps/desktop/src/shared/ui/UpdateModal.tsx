import { ArrowUpRight, Download, Sparkles, X } from 'lucide-react'
import type { GitHubReleaseInfo } from '../../hooks/useUpdateChecker'

export interface UpdateModalProps {
  isOpen: boolean
  currentVersion: string
  release: GitHubReleaseInfo | null
  onDownload: () => void
  onDismiss: (forever?: boolean) => void
}

export function UpdateModal({
  isOpen,
  currentVersion,
  release,
  onDownload,
  onDismiss,
}: UpdateModalProps) {
  if (!isOpen || !release) return null

  // Truncate body if excessively long for clean popup framing
  const cleanBody = release.body
    ? release.body.slice(0, 300) + (release.body.length > 300 ? '…' : '')
    : 'A new release is available with updates and performance improvements.'

  return (
    <div className="modal-backdrop">
      <div className="modal-panel" style={{ maxWidth: '440px' }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(245, 204, 112, 0.15)',
                border: '1px solid rgba(245, 204, 112, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--gold-secondary)',
              }}
            >
              <Sparkles size={15} />
            </div>
            <h2 className="modal-title">New Update Available</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => onDismiss(false)}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Latest Release</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                {release.tagName}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Installed</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                v{currentVersion}
              </div>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <p style={{ fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>{release.name}</p>
            <p style={{ whiteSpace: 'pre-line', color: 'var(--text-muted)', fontSize: '11px' }}>
              {cleanBody}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              className="btn-modal-primary"
              onClick={onDownload}
              style={{
                width: '100%',
                height: '38px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '13px',
              }}
            >
              <Download size={14} />
              <span>Download Update from GitHub</span>
              <ArrowUpRight size={14} style={{ opacity: 0.7 }} />
            </button>

            <button
              type="button"
              className="btn-modal-secondary"
              onClick={() => onDismiss(false)}
              style={{
                width: '100%',
                height: '32px',
                fontSize: '12px',
              }}
            >
              Remind Me Later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
