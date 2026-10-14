import { ProfileAvatar } from './ProfileAvatar'
import { RankCrest } from './RankPicker'
import {
  Pencil,
  LogIn,
  KeyRound,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  UploadCloud,
  Zap,
} from 'lucide-react'
import { getRankTierClass, formatRelativeTime } from '../../lib/sorting'

export interface TableItem {
  id: string
  name: string
  region: string
  rank?: string | null
  notes?: string
  iconAsset?: string | null
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
  launchingId?: string | null
  failedLaunchId?: string | null
  onSelect?: (id: string) => void
  activeLaunchId?: string | null
  launchStatus?: string | null
  launchLabel?: string
  onEdit?: (id: string) => void
  onRefreshSession?: (id: string) => void
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
  launchingId,
  failedLaunchId,
  onSelect,
  activeLaunchId,
  launchStatus,
  launchLabel = 'Play',
  onEdit,
  onRefreshSession,
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
                  background: isSelected
                    ? 'var(--bg-card-selected)'
                    : undefined,
                }}
              >
                <td>
                  <div className="table-profile-cell">
                    <div className="table-avatar">
                      <ProfileAvatar name={item.name} asset={item.iconAsset} />
                    </div>
                    <div className="table-profile-details">
                      <span className="table-name">{item.name}</span>
                      {item.rank ? (
                        <span
                          className={`account-rank-label ${getRankTierClass(item.rank)}`}
                          title={`Rank: ${item.rank}`}
                        >
                          <RankCrest rank={item.rank} /> {item.rank}
                        </span>
                      ) : null}
                      {item.notes ? (
                        <p className="account-notes">{item.notes}</p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>
                  <span className="table-region-badge">{item.region}</span>
                </td>
                <td>
                  {isLeased ? (
                    <span className="table-status-pill table-status-warn">
                      In Use
                    </span>
                  ) : item.hasSession ? (
                    <span
                      className={`table-status-pill ${!isCloud && (item.status === 'Session stale' || item.status?.includes('unknown')) ? 'table-status-warn' : 'table-status-ready'}`}
                    >
                      {isCloud ? 'Ready' : item.status}
                    </span>
                  ) : (
                    <span className="table-status-pill table-status-warn">
                      {isCloud ? 'Needs Sync' : item.status}
                    </span>
                  )}
                </td>
                <td
                  className="table-date-cell"
                  title={item.lastUsedText || undefined}
                >
                  {formatRelativeTime(item.lastUsedText)}
                </td>
                <td>
                  <div
                    className="table-actions-cell"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isLeased ? (
                      canManage && onForceRelease ? (
                        <button
                          type="button"
                          className="btn-table-play"
                          style={{
                            background: 'rgba(239, 68, 68, 0.2)',
                            borderColor: 'rgba(239, 68, 68, 0.4)',
                            color: '#fca5a5',
                          }}
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
                    ) : item.id === launchingId ? (
                      <button type="button" className="btn-table-play" disabled>
                        <Loader2 size={11} className="animate-spin" />
                        <span>
                          {launchStatus ? 'Waiting for client…' : 'Preparing…'}
                        </span>
                      </button>
                    ) : item.id === activeLaunchId ? (
                      <button type="button" className="btn-table-play" disabled>
                        Client running
                      </button>
                    ) : item.id === failedLaunchId ? (
                      <button
                        type="button"
                        className="btn-table-play"
                        style={{
                          background: 'rgba(239, 68, 68, 0.2)',
                          borderColor: 'rgba(239, 68, 68, 0.4)',
                          color: '#fca5a5',
                        }}
                        onClick={() => onLaunch(item.id)}
                        disabled={busy}
                      >
                        <RotateCcw size={11} />
                        <span>Retry</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-table-play"
                        onClick={() =>
                          !item.hasSession && onRefreshSession
                            ? onRefreshSession(item.id)
                            : onLaunch(item.id)
                        }
                        disabled={busy}
                      >
                        <Play size={11} fill="currentColor" />
                        <span>
                          {!item.hasSession && onRefreshSession
                            ? 'Sign in again'
                            : launchLabel}
                        </span>
                      </button>
                    )}

                    {onEdit ? (
                      <button
                        className="table-icon-btn"
                        aria-label={`Edit ${item.name}`}
                        title="Edit Profile"
                        disabled={busy}
                        onClick={() => onEdit(item.id)}
                      >
                        <Pencil size={13} />
                      </button>
                    ) : null}
                    {onRefreshSession ? (
                      <button
                        className="table-icon-btn"
                        aria-label={`Sign in again to ${item.name}`}
                        title="Sign in again"
                        disabled={busy}
                        onClick={() => onRefreshSession(item.id)}
                      >
                        <LogIn size={13} />
                      </button>
                    ) : null}
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

                    {canManage &&
                    isCloud &&
                    item.hasSession &&
                    onRevokeSession ? (
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
                        title="Publish to Shared Accounts"
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
