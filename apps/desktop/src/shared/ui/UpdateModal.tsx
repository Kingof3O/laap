import { useDialog } from '../hooks/useDialog'
import {
  ArrowUpRight,
  Download,
  ExternalLink,
  Sparkles,
  X,
  Calendar,
  Tag,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import type { GitHubReleaseInfo, UpdateStatus, DownloadProgress } from '../../hooks/useUpdateChecker'
import { openExternalUrl } from '../../lib/api'

export interface UpdateModalProps {
  isOpen: boolean
  currentVersion: string
  release: GitHubReleaseInfo | null
  status?: UpdateStatus
  downloadProgress?: DownloadProgress | null
  installError?: string | null
  onDownload: () => void
  onInstall?: () => void
  onDismiss: (forever?: boolean) => void
}

export function UpdateModal({
  isOpen,
  currentVersion,
  release,
  status = 'available',
  downloadProgress = null,
  installError = null,
  onDownload,
  onInstall,
  onDismiss,
}: UpdateModalProps) {
  const dialogRef = useDialog(isOpen, onDismiss, false)
  if (!isOpen || !release) return null

  const formattedDate = release.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  // Truncate body if excessively long for clean popup framing
  const cleanBody = release.body
    ? release.body.slice(0, 400) + (release.body.length > 400 ? '…' : '')
    : 'A new release is available with performance improvements and updates.'

  const isDownloading = status === 'downloading'
  const isVerifying = status === 'verifying'
  const isReady = status === 'ready'
  const hasError = status === 'error' || Boolean(installError)
  const isBusy = isDownloading || isVerifying
  const isVerifiedUpdate = Boolean(release.isInstallable && release.signature && onInstall)

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 MB'
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const handlePrimaryAction = () => {
    if (isReady) {
      onInstall?.()
    } else if (isVerifiedUpdate) {
      onInstall?.()
    } else {
      onDownload()
    }
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal-panel"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Update available"
        tabIndex={-1}
        style={{ maxWidth: '500px', width: '100%' }}
      >
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(201, 166, 255, 0.15)',
                border: '1px solid rgba(201, 166, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent-400)',
              }}
            >
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="modal-title">
                {isVerifiedUpdate ? 'New Update Available' : 'New Release Published'}
              </h2>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {isVerifiedUpdate ? 'Verified In-App Auto-Update' : 'Advisory Release Notification'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => onDismiss(false)}
            aria-label="Close modal"
            disabled={isBusy}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Version comparison card */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Tag size={12} /> Target Version
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--color-accent-300)',
                  marginTop: '2px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {release.tagName}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Current Version
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  marginTop: '2px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                v{currentVersion}
              </div>
            </div>
          </div>

          {/* Release info */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                {release.name}
              </span>
              {formattedDate ? (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={11} /> {formattedDate}
                </span>
              ) : null}
            </div>
            <p
              style={{
                whiteSpace: 'pre-line',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {cleanBody}
            </p>
          </div>

          {/* Progress / Status Display */}
          {isDownloading && downloadProgress ? (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(201, 166, 255, 0.08)',
                borderRadius: '8px',
                border: '1px solid rgba(201, 166, 255, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--color-accent-300)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={13} className="animate-spin" /> Downloading update package…
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {Math.round(downloadProgress.percentage)}%
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  borderRadius: '3px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, downloadProgress.percentage))}%`,
                    height: '100%',
                    background: 'var(--color-accent-400)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span>{formatBytes(downloadProgress.downloaded)}</span>
                <span>{downloadProgress.total > 0 ? formatBytes(downloadProgress.total) : 'Streaming'}</span>
              </div>
            </div>
          ) : null}

          {isVerifying ? (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(52, 184, 153, 0.08)',
                borderRadius: '8px',
                border: '1px solid rgba(52, 184, 153, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12px',
                color: 'var(--status-ready)',
              }}
            >
              <Loader2 size={16} className="animate-spin" style={{ flexShrink: 0 }} />
              <div>
                <strong>Verifying cryptographic signature…</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Checking Minisign / Ed25519 signature and Authenticode integrity.
                </div>
              </div>
            </div>
          ) : null}

          {isReady ? (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(52, 184, 153, 0.12)',
                borderRadius: '8px',
                border: '1px solid rgba(52, 184, 153, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12px',
                color: 'var(--status-ready)',
              }}
            >
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <div>
                <strong>Update package verified & ready to install.</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  The application will close and launch the verified updater.
                </div>
              </div>
            </div>
          ) : null}

          {hasError ? (
            <div
              style={{
                padding: '12px 14px',
                background: 'rgba(226, 108, 115, 0.12)',
                borderRadius: '8px',
                border: '1px solid rgba(226, 108, 115, 0.35)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '12px',
                color: 'var(--status-danger)',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Update Installation Failed</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-word' }}>
                  {installError || 'An error occurred during update download or signature verification.'}
                </div>
              </div>
            </div>
          ) : null}

          {/* Security guarantee notice */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}
          >
            {isVerifiedUpdate ? (
              <>
                <ShieldCheck size={13} style={{ color: 'var(--status-ready)' }} />
                <span>
                  Cryptographically verified update via Ed25519 digital signatures. Active matches and Riot sessions are guarded before restart.
                </span>
              </>
            ) : (
              <>
                <ExternalLink size={13} style={{ color: 'var(--text-muted)' }} />
                <span>
                  An ordinary installer has been published on GitHub Releases. Automatic in-app update is not configured for this release; download the installer manually to update.
                </span>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginTop: '4px',
            }}
          >
            <button
              type="button"
              className="btn-primary"
              onClick={handlePrimaryAction}
              disabled={isBusy}
              style={{
                width: '100%',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {isBusy ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>{isVerifying ? 'Verifying Integrity…' : 'Downloading Update…'}</span>
                </>
              ) : isReady ? (
                <>
                  <CheckCircle2 size={15} />
                  <span>Restart & Apply Update</span>
                </>
              ) : isVerifiedUpdate ? (
                <>
                  <Download size={15} />
                  <span>Download & Install Automatically</span>
                </>
              ) : (
                <>
                  <ExternalLink size={15} />
                  <span>Download from GitHub Releases</span>
                  <ArrowUpRight size={14} style={{ opacity: 0.7 }} />
                </>
              )}
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (release.htmlUrl) void openExternalUrl(release.htmlUrl)
                }}
                disabled={isBusy}
                style={{
                  flex: 1,
                  height: '34px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <ExternalLink size={13} />
                <span>View Release Notes</span>
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => onDismiss(false)}
                disabled={isBusy}
                style={{
                  flex: 1,
                  height: '34px',
                  fontSize: '12px',
                }}
              >
                Remind Me Later
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
