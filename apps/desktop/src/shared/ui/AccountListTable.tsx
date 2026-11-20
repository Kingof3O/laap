import { useMemo, useState } from 'react'
import { ProfileAvatar } from './ProfileAvatar'
import { RankCrest } from './RankPicker'
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Pencil,
  LogIn,
  KeyRound,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  Star,
  UploadCloud,
  Zap,
} from 'lucide-react'
import { getRankTierClass, formatRelativeTime, sortProfiles, type SortOrder } from '../../lib/sorting'

export interface TableItem {
  id: string
  name: string
  region: string
  rank?: string | null
  notes?: string
  iconAsset?: string | null
  hasSession: boolean
  favorite?: boolean
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
  sortOrder?: SortOrder
  onSortChange?: (order: SortOrder) => void
  onToggleFavorite?: (id: string) => void
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
  sortOrder,
  onSortChange,
  onToggleFavorite,
  onEdit,
  onRefreshSession,
  onLaunch,
  onSync,
  onPushToCloud,
  onForceRelease,
  onRevokeSession,
  onDelete,
}: AccountListTableProps) {
  const [localSort, setLocalSort] = useState<SortOrder>(sortOrder ?? 'name-asc')
  const activeSort = sortOrder ?? localSort

  const handleSort = (field: 'name' | 'rank' | 'region' | 'status' | 'last-played') => {
    let nextOrder: SortOrder
    if (field === 'name') {
      nextOrder = activeSort === 'name-asc' ? 'name-desc' : 'name-asc'
    } else if (field === 'rank') {
      nextOrder = activeSort === 'rank-desc' ? 'rank-asc' : 'rank-desc'
    } else if (field === 'region') {
      nextOrder = activeSort === 'region-asc' ? 'region-desc' : 'region-asc'
    } else if (field === 'status') {
      nextOrder = activeSort === 'status-asc' ? 'status-desc' : 'status-asc'
    } else {
      nextOrder = activeSort === 'last-played' ? 'added-desc' : 'last-played'
    }

    if (onSortChange) {
      onSortChange(nextOrder)
    } else {
      setLocalSort(nextOrder)
    }
  }

  const renderSortIndicator = (field: 'name' | 'rank' | 'region' | 'status' | 'last-played') => {
    const isCurrent =
      (field === 'name' && (activeSort === 'name-asc' || activeSort === 'name-desc')) ||
      (field === 'rank' && (activeSort === 'rank-asc' || activeSort === 'rank-desc')) ||
      (field === 'region' && (activeSort === 'region-asc' || activeSort === 'region-desc')) ||
      (field === 'status' && (activeSort === 'status-asc' || activeSort === 'status-desc')) ||
      (field === 'last-played' && (activeSort === 'last-played' || activeSort === 'added-desc' || activeSort === 'added-asc'))

    if (!isCurrent) {
      return <ChevronsUpDown size={13} className="table-sort-icon table-sort-idle" aria-hidden="true" />
    }

    const isAsc =
      activeSort === 'name-asc' ||
      activeSort === 'rank-asc' ||
      activeSort === 'region-asc' ||
      activeSort === 'status-asc' ||
      activeSort === 'added-asc'

    return isAsc ? (
      <ChevronUp size={13} className="table-sort-icon table-sort-active" aria-hidden="true" />
    ) : (
      <ChevronDown size={13} className="table-sort-icon table-sort-active" aria-hidden="true" />
    )
  }

  const displayItems = useMemo(() => {
    if (onSortChange) return items
    return sortProfiles(items, activeSort)
  }, [items, onSortChange, activeSort])

  return (
    <div className="table-wrapper">
      <table className="roster-table">
        <thead>
          <tr>
            <th>
              <button
                type="button"
                aria-label="Sort by Name"
                className={`table-header-btn ${activeSort.startsWith('name-') ? 'is-active' : ''}`}
                onClick={() => handleSort('name')}
                title="Sort by Name"
              >
                <span>Summoner Profile</span>
                {renderSortIndicator('name')}
              </button>
            </th>
            <th>
              <button
                type="button"
                aria-label="Sort by Rank"
                className={`table-header-btn ${activeSort.startsWith('rank-') ? 'is-active' : ''}`}
                onClick={() => handleSort('rank')}
                title="Sort by Rank"
              >
                <span>Rank</span>
                {renderSortIndicator('rank')}
              </button>
            </th>
            <th>
              <button
                type="button"
                aria-label="Sort by Region"
                className={`table-header-btn ${activeSort.startsWith('region-') ? 'is-active' : ''}`}
                onClick={() => handleSort('region')}
                title="Sort by Region"
              >
                <span>Region</span>
                {renderSortIndicator('region')}
              </button>
            </th>
            <th>
              <button
                type="button"
                aria-label="Sort by Status"
                className={`table-header-btn ${activeSort.startsWith('status-') ? 'is-active' : ''}`}
                onClick={() => handleSort('status')}
                title="Sort by Status"
              >
                <span>Status</span>
                {renderSortIndicator('status')}
              </button>
            </th>
            <th>
              <button
                type="button"
                aria-label="Sort by Last Activity"
                className={`table-header-btn ${activeSort === 'last-played' || activeSort.startsWith('added-') ? 'is-active' : ''}`}
                onClick={() => handleSort('last-played')}
                title="Sort by Last Activity"
              >
                <span>Last Activity</span>
                {renderSortIndicator('last-played')}
              </button>
            </th>
            <th className="table-actions-header">Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayItems.map((item) => {
            const isLeased = isCloud && item.status === 'Leased'
            const isSelected = selectedId === item.id

            return (
              <tr
                key={item.id}
                onClick={() => onSelect?.(item.id)}
                className={isSelected ? 'is-selected' : undefined}
                style={{
                  cursor: 'pointer',
                  background: isSelected
                    ? 'var(--bg-card-selected)'
                    : undefined,
                }}
              >
                <td>
                  <div className="table-profile-cell">
                    {onToggleFavorite ? (
                      <button
                        type="button"
                        className={`table-star-btn ${item.favorite ? 'table-star-active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleFavorite(item.id)
                        }}
                        title={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-label={item.favorite ? `Favorited profile ${item.name}` : `Add ${item.name} to favorites`}
                      >
                        <Star
                          size={15}
                          fill={item.favorite ? '#e5ac59' : 'none'}
                          color={item.favorite ? '#e5ac59' : 'currentColor'}
                        />
                      </button>
                    ) : item.favorite ? (
                      <Star size={14} fill="#e5ac59" color="#e5ac59" className="table-favorite" aria-label="Favorite" />
                    ) : null}
                    <div className="table-avatar">
                      <ProfileAvatar name={item.name} asset={item.iconAsset} />
                    </div>
                    <div className="table-profile-details">
                      <span className="table-name">{item.name}</span>
                      {item.notes ? (
                        <p className="account-notes">{item.notes}</p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>
                  {item.rank ? (
                    <span
                      className={`table-rank-pill ${getRankTierClass(item.rank)}`}
                      title={`Rank: ${item.rank}`}
                    >
                      <RankCrest rank={item.rank} /> {item.rank}
                    </span>
                  ) : (
                    <span className="table-rank-unranked">Unranked</span>
                  )}
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
                        className="table-icon-btn table-icon-btn-edit"
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
                        className="table-icon-btn table-icon-btn-session"
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
                        className="table-icon-btn table-icon-btn-cloud"
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
                        className="table-icon-btn table-icon-btn-cloud"
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
                        className="table-icon-btn table-icon-btn-cloud"
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
