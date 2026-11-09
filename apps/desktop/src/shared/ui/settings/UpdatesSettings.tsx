import { useState } from 'react'
import {
  RefreshCw,
  Download,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { IS_OFFLINE_ONLY, openExternalUrl } from '../../../lib/api'
import type { GitHubReleaseInfo, UpdateStatus, DownloadProgress } from '../../../hooks/useUpdateChecker'
import { GITHUB_REPO } from '../../../hooks/useUpdateChecker'

interface UpdatesSettingsProps {
  currentVersion: string
  checking: boolean
  lastChecked: Date | null
  updateAvailable: boolean
  latestRelease: GitHubReleaseInfo | null
  status?: UpdateStatus
  downloadProgress?: DownloadProgress | null
  installError?: string | null
  autoCheckOnLaunch: boolean
  onToggleAutoCheck: (enabled: boolean) => void
  onCheckUpdates?: () => Promise<void> | void
  onInstallUpdate?: () => Promise<void> | void
  onOpenReleaseModal?: () => void
  disabled?: boolean
}

export function UpdatesSettings({
  currentVersion,
  checking,
  lastChecked,
  updateAvailable,
  latestRelease,
  status = 'idle',
  downloadProgress = null,
  installError = null,
  autoCheckOnLaunch,
  onToggleAutoCheck,
  onCheckUpdates,
  onInstallUpdate,
  onOpenReleaseModal,
  disabled = false,
}: UpdatesSettingsProps) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const handleManualCheck = async () => {
    if (!onCheckUpdates) return
    setStatusMessage(null)
    try {
      await onCheckUpdates()
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const editionLabel = IS_OFFLINE_ONLY ? 'Offline Edition' : 'Team Edition'
  const isDownloading = status === 'downloading'
  const isVerifying = status === 'verifying'
  const isReady = status === 'ready'
  const isBusy = checking || isDownloading || isVerifying

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 MB'
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  return (
    <div className="settings-section" aria-label="Updates Settings">
      <div className="settings-section-header">
        <h3 className="settings-section-title">Application Updates</h3>
        <p className="settings-section-desc">
          Manage desktop release channels and update notifications.
        </p>
      </div>

      {/* Current Version Card */}
      <div className="settings-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Installed Build
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                marginTop: '2px',
              }}
            >
              v{currentVersion}
            </div>
          </div>
          <span className="badge-gold">
            {editionLabel}
          </span>
        </div>

        <div
          style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: 'var(--text-secondary)',
          }}
        >
          <span>Release Channel:</span>
          <span style={{ color: 'var(--color-gold-400)', fontWeight: 600 }}>
            Official Stable ({editionLabel})
          </span>
        </div>

        {lastChecked ? (
          <div
            style={{
              marginTop: '6px',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}
          >
            Last checked: {lastChecked.toLocaleTimeString()} ({lastChecked.toLocaleDateString()})
          </div>
        ) : null}
      </div>

      {/* Update Available Highlight */}
      {updateAvailable && latestRelease ? (
        <div
          style={{
            padding: '16px',
            borderRadius: '8px',
            background: 'rgba(200, 170, 110, 0.1)',
            border: '1px solid rgba(200, 170, 110, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-gold-300)' }}>
            <Sparkles size={16} />
            <strong style={{ fontSize: '13px' }}>
              Update Available: {latestRelease.tagName} ({latestRelease.name})
            </strong>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
            {latestRelease.body ? latestRelease.body.slice(0, 180) + '…' : 'A new desktop build is ready.'}
          </p>

          {/* Downloading Progress Bar */}
          {isDownloading && downloadProgress ? (
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--color-gold-300)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={13} className="animate-spin" /> Downloading {Math.round(downloadProgress.percentage)}%
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {formatBytes(downloadProgress.downloaded)} / {downloadProgress.total > 0 ? formatBytes(downloadProgress.total) : '…'}
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
                    background: 'var(--color-gold-400)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          ) : null}

          {isVerifying ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--status-ready)',
              }}
            >
              <Loader2 size={14} className="animate-spin" />
              <span>Verifying cryptographic signature & artifact integrity…</span>
            </div>
          ) : null}

          {isReady ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--status-ready)',
              }}
            >
              <CheckCircle2 size={14} />
              <span>Verified update ready. Launching installer…</span>
            </div>
          ) : null}

          {installError ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--status-danger)',
                background: 'rgba(226, 108, 115, 0.1)',
                padding: '8px 12px',
                borderRadius: '6px',
              }}
            >
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{installError}</div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            {latestRelease.downloadUrl && onInstallUpdate ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void onInstallUpdate()}
                disabled={isBusy}
                style={{ height: '32px', fontSize: '12px' }}
              >
                {isBusy ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>{isVerifying ? 'Verifying…' : 'Downloading…'}</span>
                  </>
                ) : (
                  <>
                    <Download size={13} />
                    <span>Install Now</span>
                  </>
                )}
              </button>
            ) : null}

            {onOpenReleaseModal ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={onOpenReleaseModal}
                disabled={isBusy}
                style={{ height: '32px', fontSize: '12px' }}
              >
                <span>View Details</span>
              </button>
            ) : null}

            <button
              type="button"
              className="btn-secondary"
              onClick={() => void openExternalUrl(latestRelease.htmlUrl)}
              disabled={isBusy}
              style={{ height: '32px', fontSize: '12px' }}
            >
              <ExternalLink size={12} />
              <span>GitHub Release</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Actions & Toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {onCheckUpdates ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleManualCheck}
              disabled={disabled || isBusy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                height: '36px',
                padding: '0 16px',
              }}
            >
              <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
              <span>{checking ? 'Checking for updates…' : 'Check for Updates'}</span>
            </button>
            {!checking && !updateAvailable && lastChecked ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: 'var(--status-ready)',
                }}
              >
                <CheckCircle2 size={14} /> Up to date
              </span>
            ) : null}
          </div>
        ) : null}

        {statusMessage ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--status-warn)',
            }}
          >
            <AlertCircle size={14} /> {statusMessage}
          </div>
        ) : null}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            userSelect: 'none',
            marginTop: '4px',
          }}
        >
          <input
            type="checkbox"
            checked={autoCheckOnLaunch}
            onChange={(e) => onToggleAutoCheck(e.target.checked)}
            disabled={disabled || isBusy}
            style={{ accentColor: 'var(--color-gold-500)', cursor: 'pointer' }}
          />
          <span>Check for updates automatically on application startup</span>
        </label>
      </div>

      {/* Security & Privacy Notice */}
      <div
        style={{
          marginTop: '16px',
          padding: '12px 14px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}
      >
        <ShieldCheck size={18} style={{ color: 'var(--color-gold-400)', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Privacy & Integrity Guarantee:</strong>
          <br />
          Update verification queries only official GitHub repository releases and manifests (
          <code>github.com/{GITHUB_REPO}</code>). Payloads are verified with Ed25519 Minisign signatures before execution. No telemetry, hardware identifiers, account credentials, or saved profiles are transmitted during update checks.
        </div>
      </div>
    </div>
  )
}
