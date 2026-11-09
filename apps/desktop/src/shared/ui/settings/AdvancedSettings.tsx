import { useState } from 'react'
import { RotateCcw, AlertTriangle, RefreshCw, Cpu } from 'lucide-react'
import { hasTauri, invokeTauri } from '../../../lib/api'
import { useToast } from '../../../context/ToastContext'

interface AdvancedSettingsProps {
  onResetRiot: () => Promise<void>
  busy: boolean
}

export function AdvancedSettings({ onResetRiot, busy }: AdvancedSettingsProps) {
  const { showSuccess, showError } = useToast()
  const [recovering, setRecovering] = useState(false)

  const handleRecoverOrphaned = async () => {
    if (!hasTauri) return
    setRecovering(true)
    try {
      await invokeTauri('recover_orphaned_account_session')
      showSuccess('Orphaned session recovery completed.')
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    } finally {
      setRecovering(false)
    }
  }

  return (
    <div className="settings-section" aria-label="Advanced Settings">
      <div className="settings-section-header">
        <h3 className="settings-section-title">Advanced Diagnostics & Recovery</h3>
        <p className="settings-section-desc">
          Diagnostic utilities, session recovery tools, and native client maintenance.
        </p>
      </div>

      {/* Riot Session Reset */}
      <div className="settings-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-warn)', marginBottom: '6px' }}>
          <AlertTriangle size={16} />
          <strong style={{ fontSize: '13px' }}>Session Cleanup & Reset</strong>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px 0' }}>
          Terminates any stray Riot processes, removes temporary sandbox state, and restores your standard Riot configuration without deleting saved accounts.
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void onResetRiot()}
          disabled={busy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            height: '36px',
            color: 'var(--status-warn)',
          }}
        >
          <RotateCcw size={14} />
          <span>Clean Active Riot Session & Reset</span>
        </button>
      </div>

      {/* Orphaned Session Recovery */}
      <div className="settings-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-gold-400)', marginBottom: '6px' }}>
          <RefreshCw size={16} />
          <strong style={{ fontSize: '13px' }}>Recover Orphaned Sessions</strong>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px 0' }}>
          Scans for uncommitted sessions left behind by sudden system shutdowns or crash events and safely archives them.
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleRecoverOrphaned}
          disabled={busy || recovering || !hasTauri}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            height: '36px',
          }}
        >
          <Cpu size={14} className={recovering ? 'animate-spin' : ''} />
          <span>{recovering ? 'Scanning & Recovering…' : 'Run Orphaned Recovery Scan'}</span>
        </button>
      </div>
    </div>
  )
}
