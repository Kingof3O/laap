import { KeyRound, Laptop, Play, RotateCcw, ShieldCheck, Zap } from 'lucide-react'
import type { RosterItem } from './AccountRosterDisplay'

export interface RosterOverviewRailProps {
  selectedItem: RosterItem | null
  totalCount: number
  readyCount: number
  leasedCount: number
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  onLaunch: (id: string) => void
  onSync?: (id: string) => void
  onForceRelease?: (id: string) => void
  onRevokeSession?: (id: string) => void
}

export function RosterOverviewRail({
  selectedItem,
  totalCount,
  readyCount,
  leasedCount,
  isCloud = false,
  canManage = false,
  busy = false,
  onLaunch,
  onSync,
  onForceRelease,
  onRevokeSession,
}: RosterOverviewRailProps) {
  const isLeased = isCloud && selectedItem?.status === 'Leased'

  return (
    <aside className="tactical-overview-rail" aria-label="Roster Overview">
      {/* Pod 1: Selected Account Inspector */}
      <div className="overview-pod">
        <div className="pod-header">
          <div className="pod-title-row">
            <Zap size={14} className="text-gold-primary" />
            <span>Profile Dossier</span>
          </div>
          {selectedItem ? (
            <span className={`pod-badge ${selectedItem.hasSession && !isLeased ? '' : 'text-amber-400 bg-amber-400/10 border-amber-400/20'}`}>
              {isLeased ? 'In Use' : selectedItem.hasSession ? 'Ready' : 'Needs Sync'}
            </span>
          ) : null}
        </div>

        {selectedItem ? (
          <div className="pod-body">
            <div className="inspector-preview-head">
              <div className="card-avatar">
                <span className="avatar-initials">{selectedItem.name.slice(0, 2).toUpperCase()}</span>
                <span className="avatar-region-pip">{selectedItem.region}</span>
              </div>
              <div className="card-info">
                <span className="inspector-name">{selectedItem.name}</span>
                <span className="inspector-tag">Server: {selectedItem.region}</span>
              </div>
            </div>

            <div className="pod-field">
              <span className="pod-field-label">Last Played</span>
              <span className="pod-field-value">{selectedItem.lastUsedText || 'Never played'}</span>
            </div>

            <div className="pod-field">
              <span className="pod-field-label">Session Status</span>
              <span className="pod-field-value">
                {isLeased ? 'Active Lease' : selectedItem.hasSession ? 'Token Verified' : 'Unsynced'}
              </span>
            </div>

            {/* Launch / Force-Release CTA */}
            <div style={{ marginTop: '6px' }}>
              {isLeased ? (
                canManage && onForceRelease ? (
                  <button
                    type="button"
                    className="inspector-launch-btn"
                    style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
                    onClick={() => onForceRelease(selectedItem.id)}
                    disabled={busy}
                  >
                    <RotateCcw size={14} />
                    <span>Force Release Account</span>
                  </button>
                ) : (
                  <button type="button" className="inspector-launch-btn" disabled>
                    <span>Currently In Use</span>
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="inspector-launch-btn"
                  onClick={() => onLaunch(selectedItem.id)}
                  disabled={busy}
                >
                  <Play size={14} fill="currentColor" />
                  <span>{isCloud ? 'Claim & Launch' : 'Play Game'}</span>
                </button>
              )}
            </div>

            {/* Secondary actions */}
            {canManage && isCloud ? (
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                {onSync ? (
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    style={{ flex: 1, height: '30px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                    onClick={() => onSync(selectedItem.id)}
                    disabled={busy}
                  >
                    <Zap size={12} />
                    <span>Sync Session</span>
                  </button>
                ) : null}
                {selectedItem.hasSession && onRevokeSession ? (
                  <button
                    type="button"
                    className="btn-modal-secondary"
                    style={{ flex: 1, height: '30px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                    onClick={() => onRevokeSession(selectedItem.id)}
                    disabled={busy}
                  >
                    <KeyRound size={12} />
                    <span>Wipe Token</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            Click an account profile in the roster to view launch details.
          </div>
        )}
      </div>

      {/* Pod 2: Hardware Security & Anti-Cheat Pod */}
      <div className="overview-pod">
        <div className="pod-header">
          <div className="pod-title-row">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Hardware Security</span>
          </div>
          <span className="pod-badge">Vanguard Safe</span>
        </div>

        <div className="pod-body">
          <div className="pod-field">
            <span className="pod-field-label">Machine Identity</span>
            <span className="pod-field-value pod-field-value-mono">Ed25519 Keychain</span>
          </div>
          <div className="pod-field">
            <span className="pod-field-label">Anti-Cheat Risk</span>
            <span className="pod-field-value" style={{ color: 'var(--status-ready)' }}>0% (No Memory Injection)</span>
          </div>
          <div className="pod-field">
            <span className="pod-field-label">Settings Rollback</span>
            <span className="pod-field-value">Auto-Restore Active</span>
          </div>
        </div>
      </div>

      {/* Pod 3: Roster Metrics */}
      <div className="overview-pod">
        <div className="pod-header">
          <div className="pod-title-row">
            <Laptop size={14} />
            <span>Roster Pulse</span>
          </div>
        </div>

        <div className="pod-body">
          <div className="pod-field">
            <span className="pod-field-label">Total Profiles</span>
            <span className="pod-field-value">{totalCount}</span>
          </div>
          <div className="pod-field">
            <span className="pod-field-label">Ready to Launch</span>
            <span className="pod-field-value" style={{ color: 'var(--status-ready)' }}>{readyCount}</span>
          </div>
          {isCloud ? (
            <div className="pod-field">
              <span className="pod-field-label">Currently In Use</span>
              <span className="pod-field-value" style={{ color: 'var(--status-leased)' }}>{leasedCount}</span>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
