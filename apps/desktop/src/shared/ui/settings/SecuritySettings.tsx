import { ShieldCheck, Lock, Database, FileCheck } from 'lucide-react'
import { IS_OFFLINE_ONLY } from '../../../lib/api'

interface SecuritySettingsProps {
  busy?: boolean
}

export function SecuritySettings({ busy = false }: SecuritySettingsProps) {
  return (
    <div className="settings-section" aria-label="Security and Vault Settings">
      <div className="settings-section-header">
        <h3 className="settings-section-title">Security & Local Vault</h3>
        <p className="settings-section-desc">
          Cryptographic storage, process sandboxing, and data privacy guarantees.
        </p>
      </div>

      {/* Security Status Card */}
      <div
        style={{
          padding: '14px',
          background: 'rgba(52, 184, 153, 0.08)',
          borderRadius: '8px',
          border: '1px solid rgba(52, 184, 153, 0.25)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <ShieldCheck
          size={24}
          style={{ color: 'var(--status-ready)', flexShrink: 0 }}
        />
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>
            {IS_OFFLINE_ONLY ? 'Local Vault Encrypted' : 'Local device identity'}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginTop: '2px',
            }}
          >
            {IS_OFFLINE_ONLY
              ? 'AES-GCM encrypted local vault. Icons, rank sync and LAAP Presence setup can use the network.'
              : 'Your local identity is used for shared-account access.'}
          </div>
        </div>
      </div>

      {/* Technical Specifications */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginTop: '12px',
        }}
      >
        <div className="settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent-400)', marginBottom: '6px' }}>
            <Lock size={15} />
            <strong style={{ fontSize: '12px' }}>Encryption Standard</strong>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            AES-256-GCM authenticated cipher with device-bound machine entropy and non-repeating initialization vectors.
          </div>
        </div>

        <div className="settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent-400)', marginBottom: '6px' }}>
            <Database size={15} />
            <strong style={{ fontSize: '12px' }}>Zero Plaintext Storage</strong>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Riot session tokens, cookies, and credentials are encrypted prior to hitting the physical disk.
          </div>
        </div>

        <div className="settings-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent-400)', marginBottom: '6px' }}>
            <FileCheck size={15} />
            <strong style={{ fontSize: '12px' }}>Network Isolation</strong>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {IS_OFFLINE_ONLY
              ? 'Offline Edition webview is strictly restricted with connect-src \'none\' CSP. Host network calls are manual and direct only.'
              : 'End-to-end authenticated API sessions with role-based access control for cloud leases.'}
          </div>
        </div>
      </div>
    </div>
  )
}
