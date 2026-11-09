import { ExternalLink, Code2, Heart, Shield } from 'lucide-react'
import { IS_OFFLINE_ONLY, openExternalUrl } from '../../../lib/api'
import { GITHUB_REPO } from '../../../hooks/useUpdateChecker'

interface AboutSettingsProps {
  currentVersion: string
}

export function AboutSettings({ currentVersion }: AboutSettingsProps) {
  const repoUrl = `https://github.com/${GITHUB_REPO}`

  return (
    <div className="settings-section" aria-label="About LAAP">
      <div className="settings-section-header">
        <h3 className="settings-section-title">About LAAP Tactical Launcher</h3>
        <p className="settings-section-desc">
          High-performance, secure, and privacy-first multi-account management for League of Legends.
        </p>
      </div>

      <div className="settings-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(200, 170, 110, 0.2), rgba(16, 27, 44, 0.8))',
              border: '1px solid var(--border-gold-focus)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '18px',
              color: 'var(--color-gold-400)',
            }}
          >
            L
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>
              LAAP Tactical Launcher
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Version {currentVersion} · {IS_OFFLINE_ONLY ? 'Offline Edition' : 'Team Edition'}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: '16px',
            paddingTop: '14px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Created by:</span>
            <span style={{ color: '#FFFFFF', fontWeight: 600 }}>Hussien Salah</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Core Engine:</span>
            <span style={{ color: 'var(--text-primary)' }}>Tauri 2 + Rust + React 19</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Security Architecture:</span>
            <span style={{ color: 'var(--text-primary)' }}>AES-256-GCM Local Vault</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void openExternalUrl(repoUrl)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '34px',
              fontSize: '12px',
            }}
          >
            <Code2 size={14} />
            <span>GitHub Repository</span>
            <ExternalLink size={12} style={{ opacity: 0.6 }} />
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => void openExternalUrl(`${repoUrl}/releases`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '34px',
              fontSize: '12px',
            }}
          >
            <span>Release Notes</span>
            <ExternalLink size={12} style={{ opacity: 0.6 }} />
          </button>
        </div>
      </div>

      {/* Riot Games Disclaimer */}
      <div
        style={{
          padding: '12px 14px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}
      >
        LAAP is an open-source productivity utility and is not endorsed, affiliated, or certified by Riot Games or any of its subsidiaries. League of Legends, Valorant, and Riot Games are trademarks or registered trademarks of Riot Games, Inc.
      </div>
    </div>
  )
}
