import { useMemo } from 'react'
import { BarChart3, KeyRound, Play, RotateCcw, ShieldCheck, Zap } from 'lucide-react'
import type { RosterItem } from './AccountRosterDisplay'

export interface RosterOverviewRailProps {
  selectedItem: RosterItem | null
  items: RosterItem[]
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
  items,
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

  // Calculate Region Distribution for the visual mini-chart
  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      counts[item.region] = (counts[item.region] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [items])

  const unsyncedCount = Math.max(0, totalCount - readyCount - leasedCount)
  const readyPercent = totalCount > 0 ? (readyCount / totalCount) * 100 : 0
  const leasedPercent = totalCount > 0 ? (leasedCount / totalCount) * 100 : 0
  const unsyncedPercent = totalCount > 0 ? (unsyncedCount / totalCount) * 100 : 0

  return (
    <aside className="tactical-overview-rail" aria-label="Roster Overview">
      {/* Pod 1: Selected Account Quick Launch */}
      <div className="overview-pod">
        <div className="pod-header">
          <div className="pod-title-row">
            <Zap size={14} className="text-gold-primary" />
            <span>Quick Launch</span>
          </div>
          {selectedItem ? (
            <span className={`pod-badge ${selectedItem.hasSession && !isLeased ? '' : 'text-amber-400 bg-amber-400/10 border-amber-400/20'}`}>
              {isLeased ? 'In Use' : selectedItem.hasSession ? 'Ready to Play' : 'Needs Login'}
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
              <span className="pod-field-label">Status</span>
              <span className="pod-field-value" style={{ color: isLeased ? 'var(--status-leased)' : selectedItem.hasSession ? 'var(--status-ready)' : 'var(--text-muted)' }}>
                {isLeased ? 'In Use' : selectedItem.hasSession ? 'Ready to Play' : 'Needs Login'}
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
                    <span>Force Release Session</span>
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

            {/* Secondary admin actions */}
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
                    <span>Wipe Session</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            Select an account from the roster to launch League of Legends.
          </div>
        )}
      </div>

      {/* Pod 2: Roster Breakdown & Distribution Chart */}
      <div className="overview-pod">
        <div className="pod-header">
          <div className="pod-title-row">
            <BarChart3 size={14} className="text-gold-primary" />
            <span>Roster Breakdown</span>
          </div>
          <span className="pod-badge">
            {totalCount} {totalCount === 1 ? 'Profile' : 'Profiles'}
          </span>
        </div>

        <div className="pod-body">
          <div className="pod-chart-container">
            {/* Visual Multi-Segment Readiness Bar */}
            <div className="chart-bar-track" title={`${Math.round(readyPercent)}% Ready to Launch`}>
              <div className="chart-bar-segment chart-bar-ready" style={{ width: `${readyPercent}%` }} />
              {isCloud && leasedPercent > 0 ? (
                <div className="chart-bar-segment chart-bar-leased" style={{ width: `${leasedPercent}%` }} />
              ) : null}
              {unsyncedPercent > 0 ? (
                <div className="chart-bar-segment chart-bar-unsynced" style={{ width: `${unsyncedPercent}%` }} />
              ) : null}
            </div>

            {/* Status Legend Row */}
            <div className="chart-legend-row">
              <div className="chart-legend-item">
                <span className="legend-dot" style={{ background: '#10B981' }} />
                <span>{readyCount} Ready</span>
              </div>
              {isCloud ? (
                <div className="chart-legend-item">
                  <span className="legend-dot" style={{ background: '#F59E0B' }} />
                  <span>{leasedCount} In Use</span>
                </div>
              ) : null}
              {unsyncedCount > 0 ? (
                <div className="chart-legend-item">
                  <span className="legend-dot" style={{ background: 'rgba(255,255,255,0.3)' }} />
                  <span>{unsyncedCount} Needs Login</span>
                </div>
              ) : null}
            </div>

            {/* Region Distribution Mini-Bars */}
            {regionCounts.length > 0 ? (
              <div className="region-distribution-list">
                <div className="region-distribution-title">
                  <span>Server Distribution</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{regionCounts.length} {regionCounts.length === 1 ? 'region' : 'regions'}</span>
                </div>
                {regionCounts.map(([region, count]) => (
                  <div key={region} className="region-stat-row">
                    <span className="region-tag-mini">{region}</span>
                    <div className="region-bar-track">
                      <div
                        className="region-bar-fill"
                        style={{ width: `${totalCount > 0 ? (count / totalCount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="region-stat-count">{count}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Pod 3: Runtime boundary */}
      <div className="overview-pod pod-security-trust">
        <div className="security-trust-content">
          <div className="security-trust-icon">
            <ShieldCheck size={18} className="text-emerald-400" />
          </div>
          <div className="security-trust-text">
            <div className="security-trust-title">External launcher</div>
            <div className="security-trust-desc">
              LAAP does not read game memory or automate inputs. Riot controls authentication.
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
