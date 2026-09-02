import { Play, Trash2, UploadCloud, Zap } from 'lucide-react'

interface TableItem {
  id: string
  name: string
  region: string
  hasSession: boolean
  lastUsedText?: string | null
}

interface AccountListTableProps {
  items: TableItem[]
  isCloud?: boolean
  canManage?: boolean
  busy?: boolean
  onLaunch: (id: string) => void
  onSync?: (id: string) => void
  onPushToCloud?: (id: string) => void
  onDelete: (id: string, name: string) => void
}

export function AccountListTable({
  items,
  isCloud = false,
  canManage = false,
  busy = false,
  onLaunch,
  onSync,
  onPushToCloud,
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
          {items.map((item) => (
            <tr key={item.id}>
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
                {item.hasSession ? (
                  <span className="table-status-pill table-status-ready">Ready</span>
                ) : (
                  <span className="table-status-pill table-status-warn">Needs Sync</span>
                )}
              </td>
              <td className="table-date-cell">
                {item.lastUsedText || 'Never played'}
              </td>
              <td>
                <div className="table-actions-cell">
                  <button
                    type="button"
                    className="btn-table-play"
                    onClick={() => onLaunch(item.id)}
                    disabled={busy}
                  >
                    <Play size={12} fill="currentColor" />
                    <span>Play</span>
                  </button>

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

                  {canManage && !isCloud && onPushToCloud ? (
                    <button
                      type="button"
                      className="table-icon-btn"
                      onClick={() => onPushToCloud(item.id)}
                      disabled={busy}
                      title="Publish to Team Vault"
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
          ))}
        </tbody>
      </table>
    </div>
  )
}
