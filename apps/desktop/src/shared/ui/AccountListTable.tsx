import { KeyRound, Play, RotateCcw, Trash2, UploadCloud, Zap } from 'lucide-react'

export interface TableItem {
  id: string
  name: string
  region: string
  hasSession: boolean
  lastUsedText?: string | null
  status?: string
}

export interface AccountListTableProps {
  items: TableItem[]
  selectedId?: string | null
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  onSelect?: (id: string) => void
  onLaunch: (id: string) => void
  onSync?: (id: string) => void
  onPushToCloud?: (id: string) => void
  onForceRelease?: (id: string) => void
  onRevokeSession?: (id: string) => void
  onDelete: (id: string, name: string) => void
}

export function AccountListTable({
  items,
  selectedId,
  isCloud = false,
  canManage = false,
  busy = false,
  onSelect,
  onLaunch,
  onSync,
  onPushToCloud,
  onForceRelease,
  onRevokeSession,
  onDelete,
}: AccountListTableProps) {
  return (
    <div className="table-wrapper">
      <table className="roster-table">
        <thead>
          <tr>
            <th>Summoner Profile</th>
            <th>Region</th>
            <th>Status</th>
            <th>Last Activity</th>
            <th className="table-actions-header">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isLeased = isCloud && item.status === 'Leased'
            const isSelected = selectedId === item.id

            return (
              <tr
                key={item.id}
                onClick={() => onSelect?.(item.id)}
                style={{
                  cursor: 'pointer',
                  background: isSelected ? 'var(--bg-card-selected)' : undefined,
                }}
              >
                <td>
                  <div className="table-profile-cell">
                    <div className="table-avatar">{item.name.slice(0, 2).toUpperCase()}</div>
                    <span className="table-name">{item.name}</span>
                  </div>
                </td>
                <td>
                  <span className="table-region-badge">{item.region}</span>
                </td>
                <td>
                  {isLeased ? (
                    <span className="table-status-pill table-status-warn">In Use</span>
                  ) : item.hasSession ? (
                    <span className="table-status-pill table-status-ready">Ready</span>
                  ) : (
                    <span className="table-status-pill table-status-warn">Needs Sync</span>
                  )}
                </td>
                <td className="table-date-cell">
                  {item.lastUsedText || 'Never played'}
                </td>
                <td>
                  <div className="table-actions-cell" onClick={(e) => e.stopPropagation()}>
                    {isLeased ? (
                      canManage && onForceRelease ? (
                        <button
                          type="button"
                          className="btn-table-play"
                          style={{ background: 'rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
                          onClick={() => onForceRelease(item.id)}
                          disabled={busy}
                          title="Force Release / Kick active session"
                        >
                          <RotateCcw size={11} />
                          <span>Kick</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-table-play"
                          disabled
                        >
                          <span>In Use</span>
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        className="btn-table-play"
                        onClick={() => onLaunch(item.id)}
                        disabled={busy}
                      >
                        <Play size={11} fill="currentColor" />
                        <span>Play</span>
                      </button>
                    )}

                    {canManage && isCloud && onSync ? (
                      <button
                        type="button"
                        className="table-icon-btn"
                        onClick={() => onSync(item.id)}
                        disabled={busy}
                        title="Sync Session"
                      >
                        <Zap size={13} />
                      </button>
                    ) : null}

                    {canManage && isCloud && item.hasSession && onRevokeSession ? (
                      <button
                        type="button"
                        className="table-icon-btn"
                        onClick={() => onRevokeSession(item.id)}
                        disabled={busy}
                        title="Revoke Session Token"
                      >
                        <KeyRound size={13} />
                      </button>
                    ) : null}

                    {canManage && !isCloud && onPushToCloud ? (
                      <button
                        type="button"
                        className="table-icon-btn"
                        onClick={() => onPushToCloud(item.id)}
                        disabled={busy}
                        title="Publish to Shared Vault"
                      >
                        <UploadCloud size={13} />
                      </button>
                    ) : null}

                    {canManage ? (
                      <button
                        type="button"
                        className="table-icon-btn table-icon-btn-danger"
                        onClick={() => onDelete(item.id, item.name)}
                        disabled={busy}
                        title="Remove Account"
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
